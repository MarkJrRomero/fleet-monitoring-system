package vehicles

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type simulationStatus struct {
	Running       bool       `json:"running"`
	SelectedCount int        `json:"selected_count"`
	TickMS        int        `json:"tick_ms"`
	RequestsSent  int64      `json:"requests_sent"`
	ErrorsCount   int64      `json:"errors_count"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
}

type simulationTransmission struct {
	ID         int64  `json:"id"`
	VehicleID  string `json:"vehicle_id"`
	Kind       string `json:"kind"`
	Result     string `json:"result"`
	Note       string `json:"note"`
	StatusCode int    `json:"status_code"`
	Timestamp  string `json:"timestamp"`
}

type simulator struct {
	db               *pgxpool.Pool
	ingestionBaseURL string
	client           *http.Client
	fixedVehicleID   string
	tokenProvider    bearerTokenProvider

	mu             sync.RWMutex
	running        bool
	selectedCount  int
	tickMS         int
	requestsSent   int64
	errorsCount    int64
	startedAt      time.Time
	lastError      string
	cancel         context.CancelFunc
	motionByID     map[string]motionState
	alertClockByID map[string]time.Time
	batchCursor    int
	transmissions  []simulationTransmission
	traceSeq       int64
}

const (
	simulationActiveRatio     = 0.80
	simulationStoppedRatio    = 0.20
	simulationPanicRatio      = 0.05
	simulationOverspeedRatio  = 0.10
	simulationBatchRatio      = 0.20
	simulationDuplicateRatio  = 0.10
	simulationMalformedRatio  = 0.05
	simulationDispatchWorkers = 24
	maxTraceEntries           = 500
)

type motionState struct {
	headingRad    float64
	speedMps      float64
	turnRateRadS  float64
	batteryLevel  float64
	noSignalUntil time.Time
	unknownUntil  time.Time
}

type simulationVehicle struct {
	VehicleID string
	Lat       float64
	Lng       float64
}

type ingestionGPSPayload struct {
	VehicleID   string  `json:"vehicle_id"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	SpeedKmh    float64 `json:"speed_kmh"`
	Status      string  `json:"status,omitempty"`
	PanicButton bool    `json:"panic_button,omitempty"`
	Timestamp   string  `json:"timestamp"`
}

type bearerTokenProvider interface {
	AccessToken(ctx context.Context) (string, error)
}

func NewSimulator(db *pgxpool.Pool, ingestionBaseURL string, tokenProvider bearerTokenProvider) *simulator {
	return &simulator{
		db:               db,
		ingestionBaseURL: strings.TrimRight(ingestionBaseURL, "/"),
		tokenProvider:    tokenProvider,
		client: &http.Client{
			Timeout: 8 * time.Second,
		},
		motionByID:     make(map[string]motionState),
		alertClockByID: make(map[string]time.Time),
	}
}

func NewFixedVehicleSimulator(db *pgxpool.Pool, ingestionBaseURL, vehicleID string, tokenProvider bearerTokenProvider) *simulator {
	sim := NewSimulator(db, ingestionBaseURL, tokenProvider)
	sim.fixedVehicleID = strings.ToUpper(strings.TrimSpace(vehicleID))
	return sim
}

func (s *simulator) Start(selectedCount, tickMS int) error {
	if s.fixedVehicleID != "" {
		selectedCount = 1
	}
	if selectedCount <= 0 {
		return errors.New("selected_count debe ser mayor a 0")
	}
	if selectedCount > 5000 {
		return errors.New("selected_count excede maximo permitido (5000)")
	}
	if tickMS < 120 {
		return errors.New("tick_ms minimo permitido: 120")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return errors.New("la simulacion ya esta en ejecucion")
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.running = true
	s.selectedCount = selectedCount
	s.tickMS = tickMS
	s.requestsSent = 0
	s.errorsCount = 0
	s.startedAt = time.Now().UTC()
	s.lastError = ""
	s.cancel = cancel
	s.motionByID = make(map[string]motionState)
	s.alertClockByID = make(map[string]time.Time)
	s.batchCursor = 0
	s.transmissions = make([]simulationTransmission, 0, maxTraceEntries)
	s.traceSeq = 0

	go s.loop(ctx)
	return nil
}

func (s *simulator) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}

	cancel := s.cancel
	s.running = false
	s.cancel = nil
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
}

func (s *simulator) ResetState() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.running = false
	s.selectedCount = 0
	s.tickMS = 1000
	s.requestsSent = 0
	s.errorsCount = 0
	s.startedAt = time.Time{}
	s.lastError = ""
	s.cancel = nil
	s.motionByID = make(map[string]motionState)
	s.alertClockByID = make(map[string]time.Time)
	s.batchCursor = 0
	s.transmissions = make([]simulationTransmission, 0, maxTraceEntries)
	s.traceSeq = 0
}

func (s *simulator) Status() simulationStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	status := simulationStatus{
		Running:       s.running,
		SelectedCount: s.selectedCount,
		TickMS:        s.tickMS,
		RequestsSent:  s.requestsSent,
		ErrorsCount:   s.errorsCount,
		LastError:     s.lastError,
	}

	if !s.startedAt.IsZero() {
		startedAt := s.startedAt
		status.StartedAt = &startedAt
	}

	return status
}

func (s *simulator) loop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(s.getTickMS()) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.runTick(ctx); err != nil {
				s.registerError(err.Error())
			}
		}
	}
}

func (s *simulator) runTick(ctx context.Context) error {
	limit := s.getSelectedCount()
	if limit <= 0 {
		return nil
	}

	vehicles, err := s.loadVehicles(ctx, limit)
	if err != nil {
		return err
	}
	if len(vehicles) == 0 {
		return nil
	}

	batchSize := int(math.Ceil(float64(len(vehicles)) * simulationBatchRatio))
	if batchSize < 1 {
		batchSize = 1
	}

	batch := s.nextBatch(vehicles, batchSize)
	if len(batch) == 0 {
		return nil
	}

	base := time.Now().UTC()
	deltaSeconds := float64(s.getTickMS()) / 1000.0
	inactiveTargets, stoppedTargets, panicTargets, overspeedTargets := s.pickSimulationAssignments(len(batch))

	type dispatchTask struct {
		vehicle      simulationVehicle
		lat          float64
		lng          float64
		speedKmh     float64
		status       string
		panicButton  bool
		forceStopped bool
		shouldSend   bool
	}

	tasks := make([]dispatchTask, 0, len(batch))
	for idx, vehicle := range batch {
		_, forceInactive := inactiveTargets[idx]
		_, forceStoppedAlert := stoppedTargets[idx]
		_, forceOverspeed := overspeedTargets[idx]
		_, forcePanic := panicTargets[idx]
		lat, lng, speedKmh := vehicle.Lat, vehicle.Lng, 0.0
		status, shouldSend := "online", true
		panicButton := false

		if forceInactive {
			shouldSend = false
			if idx%2 == 0 {
				status = "no_signal"
			} else {
				status = "unknown"
			}
		} else if forceStoppedAlert {
			status = "stopped"
		} else {
			lat, lng, speedKmh = s.nextPosition(vehicle.VehicleID, vehicle.Lat, vehicle.Lng, deltaSeconds)
			if forceOverspeed {
				speedKmh = 105 + rand.Float64()*35
				status = "overspeed"
			} else if forcePanic {
				status = "panic"
				panicButton = true
				if speedKmh < 8 {
					speedKmh = 8
				}
			} else {
				status = "online"
			}
		}

		tasks = append(tasks, dispatchTask{
			vehicle:      vehicle,
			lat:          lat,
			lng:          lng,
			speedKmh:     speedKmh,
			status:       status,
			panicButton:  panicButton,
			forceStopped: forceStoppedAlert,
			shouldSend:   shouldSend,
		})
	}

	if len(tasks) == 0 {
		return nil
	}

	workers := minInt(simulationDispatchWorkers, len(tasks))
	if workers <= 0 {
		workers = 1
	}

	jobs := make(chan dispatchTask)
	var wg sync.WaitGroup

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range jobs {
				if err := s.updateVehicleTelemetry(ctx, task.vehicle.VehicleID, task.lat, task.lng, task.status); err != nil {
					s.registerError(err.Error())
					continue
				}

				if !task.shouldSend {
					continue
				}

				timestamp := s.nextEventTimestamp(task.vehicle.VehicleID, base, task.forceStopped)
				statusCode, body, err := s.sendToIngestion(ctx, task.vehicle.VehicleID, task.lat, task.lng, task.speedKmh, task.status, task.panicButton, timestamp)
				result, note := classifyIngestionOutcome(statusCode, body, err)
				s.recordTransmission(simulationTransmission{
					VehicleID:  task.vehicle.VehicleID,
					Kind:       "normal",
					Result:     result,
					Note:       note,
					StatusCode: statusCode,
					Timestamp:  timestamp.Format(time.RFC3339Nano),
				})
				if err != nil {
					s.registerError(err.Error())
					continue
				}

				s.incrementRequests(1)

				if rand.Float64() < simulationDuplicateRatio {
					dupStatusCode, dupBody, dupErr := s.sendToIngestion(ctx, task.vehicle.VehicleID, task.lat, task.lng, task.speedKmh, task.status, task.panicButton, timestamp)
					dupResult, dupNote := classifyIngestionOutcome(dupStatusCode, dupBody, dupErr)
					s.recordTransmission(simulationTransmission{
						VehicleID:  task.vehicle.VehicleID,
						Kind:       "duplicado",
						Result:     dupResult,
						Note:       dupNote,
						StatusCode: dupStatusCode,
						Timestamp:  timestamp.Format(time.RFC3339Nano),
					})
					if dupErr != nil {
						s.registerError(dupErr.Error())
					}
				}

				if rand.Float64() < simulationMalformedRatio {
					badStatusCode, badBody, badErr := s.sendMalformedToIngestion(ctx, task.vehicle.VehicleID, timestamp)
					badResult, badNote := classifyIngestionOutcome(badStatusCode, badBody, badErr)
					s.recordTransmission(simulationTransmission{
						VehicleID:  task.vehicle.VehicleID,
						Kind:       "error_formato",
						Result:     badResult,
						Note:       badNote,
						StatusCode: badStatusCode,
						Timestamp:  timestamp.Format(time.RFC3339Nano),
					})
					if badErr != nil {
						s.registerError(badErr.Error())
					}
				}
			}
		}()
	}

	for _, task := range tasks {
		jobs <- task
	}
	close(jobs)
	wg.Wait()

	return nil
}

func (s *simulator) pickSimulationAssignments(total int) (map[int]struct{}, map[int]struct{}, map[int]struct{}, map[int]struct{}) {
	inactiveTargets := make(map[int]struct{})
	stoppedTargets := make(map[int]struct{})
	panicTargets := make(map[int]struct{})
	overspeedTargets := make(map[int]struct{})

	if total <= 0 {
		return inactiveTargets, stoppedTargets, panicTargets, overspeedTargets
	}

	activeCount := int(math.Round(float64(total) * simulationActiveRatio))
	if activeCount < 0 {
		activeCount = 0
	}
	if activeCount > total {
		activeCount = total
	}
	inactiveCount := total - activeCount

	stoppedCount := minInt(int(math.Round(float64(activeCount)*simulationStoppedRatio)), activeCount)
	panicCount := minInt(int(math.Round(float64(activeCount)*simulationPanicRatio)), activeCount-stoppedCount)
	overspeedCount := minInt(int(math.Round(float64(activeCount)*simulationOverspeedRatio)), activeCount-stoppedCount-panicCount)

	perm := rand.Perm(total)
	cursor := 0
	for i := 0; i < inactiveCount; i++ {
		inactiveTargets[perm[cursor]] = struct{}{}
		cursor++
	}
	for i := 0; i < stoppedCount; i++ {
		stoppedTargets[perm[cursor]] = struct{}{}
		cursor++
	}
	for i := 0; i < panicCount; i++ {
		panicTargets[perm[cursor]] = struct{}{}
		cursor++
	}
	for i := 0; i < overspeedCount; i++ {
		overspeedTargets[perm[cursor]] = struct{}{}
		cursor++
	}

	return inactiveTargets, stoppedTargets, panicTargets, overspeedTargets
}

func (s *simulator) nextBatch(vehicles []simulationVehicle, batchSize int) []simulationVehicle {
	total := len(vehicles)
	if total == 0 || batchSize <= 0 {
		return nil
	}
	effectiveSize := batchSize
	if effectiveSize > total {
		effectiveSize = total
	}

	s.mu.Lock()
	if s.batchCursor >= total {
		s.batchCursor = 0
	}
	start := s.batchCursor
	s.batchCursor = (start + effectiveSize) % total
	s.mu.Unlock()

	batch := make([]simulationVehicle, 0, effectiveSize)
	for i := 0; i < effectiveSize; i++ {
		idx := (start + i) % total
		batch = append(batch, vehicles[idx])
	}

	return batch
}

func (s *simulator) nextPosition(vehicleID string, lat, lng, deltaSeconds float64) (float64, float64, float64) {
	s.mu.Lock()
	state, ok := s.motionByID[vehicleID]
	if !ok {
		state = motionState{
			headingRad:   rand.Float64() * 2 * math.Pi,
			speedMps:     2.5 + rand.Float64()*5.0,
			turnRateRadS: (rand.Float64() - 0.5) * 0.04,
			batteryLevel: 35 + rand.Float64()*65,
		}
	}

	state.turnRateRadS += (rand.Float64() - 0.5) * 0.01
	if state.turnRateRadS > 0.08 {
		state.turnRateRadS = 0.08
	}
	if state.turnRateRadS < -0.08 {
		state.turnRateRadS = -0.08
	}

	state.headingRad = normalizeAngle(state.headingRad + state.turnRateRadS*deltaSeconds)

	targetSpeed := 3.5 + rand.Float64()*6.5
	state.speedMps += (targetSpeed - state.speedMps) * 0.15
	if state.speedMps < 1.2 {
		state.speedMps = 1.2
	}
	if state.speedMps > 12.0 {
		state.speedMps = 12.0
	}

	s.motionByID[vehicleID] = state
	s.mu.Unlock()

	distanceMeters := state.speedMps * deltaSeconds
	if rand.Float64() < 0.07 {
		distanceMeters *= 2.2 + rand.Float64()*1.5
	}
	dxEastMeters := math.Cos(state.headingRad) * distanceMeters
	dyNorthMeters := math.Sin(state.headingRad) * distanceMeters

	latRadians := lat * math.Pi / 180.0
	dLat := dyNorthMeters / 111320.0
	dLng := dxEastMeters / (111320.0 * math.Max(math.Cos(latRadians), 0.2))

	nextLat := clampLat(lat + dLat)
	nextLng := clampLng(lng + dLng)
	clampedLat, clampedLng := clampToBogota(nextLat, nextLng)
	return clampedLat, clampedLng, state.speedMps * 3.6
}

func (s *simulator) nextEventTimestamp(vehicleID string, current time.Time, forceStoppedAlert bool) time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()

	last, ok := s.alertClockByID[vehicleID]
	if !ok {
		s.alertClockByID[vehicleID] = current
		return current
	}

	if forceStoppedAlert {
		next := last.Add(70 * time.Second)
		s.alertClockByID[vehicleID] = next
		return next
	}

	next := last.Add(time.Duration(s.tickMS) * time.Millisecond)
	if next.Before(current) {
		next = current
	}
	s.alertClockByID[vehicleID] = next
	return next
}

func (s *simulator) nextStatus(vehicleID string, speedKmh float64, now time.Time) (string, bool) {
	s.mu.Lock()
	state, ok := s.motionByID[vehicleID]
	if !ok {
		state = motionState{
			batteryLevel: 40 + rand.Float64()*60,
		}
	}

	state.batteryLevel -= 0.05 + rand.Float64()*0.25
	if state.batteryLevel < 2 {
		state.batteryLevel = 2
	}

	if now.Before(state.noSignalUntil) {
		s.motionByID[vehicleID] = state
		s.mu.Unlock()
		return "no_signal", false
	}
	if now.Before(state.unknownUntil) {
		s.motionByID[vehicleID] = state
		s.mu.Unlock()
		return "unknown", false
	}

	if rand.Float64() < 0.015 {
		state.noSignalUntil = now.Add(time.Duration(10+rand.Intn(15)) * time.Second)
		s.motionByID[vehicleID] = state
		s.mu.Unlock()
		return "no_signal", false
	}
	if rand.Float64() < 0.008 {
		state.unknownUntil = now.Add(time.Duration(8+rand.Intn(12)) * time.Second)
		s.motionByID[vehicleID] = state
		s.mu.Unlock()
		return "unknown", false
	}

	status := "online"
	if speedKmh >= 72 {
		status = "overspeed"
	} else if state.batteryLevel <= 15 {
		status = "low_battery"
	}

	s.motionByID[vehicleID] = state
	s.mu.Unlock()
	return status, true
}

func (s *simulator) loadVehicles(ctx context.Context, limit int) ([]simulationVehicle, error) {
	if s.fixedVehicleID != "" {
		rows, err := s.db.Query(ctx, `
			SELECT vehicle_id, lat, lng
			FROM vehicles
			WHERE vehicle_id = $1
			LIMIT 1
		`, s.fixedVehicleID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		items := make([]simulationVehicle, 0, 1)
		for rows.Next() {
			var v simulationVehicle
			if err := rows.Scan(&v.VehicleID, &v.Lat, &v.Lng); err != nil {
				return nil, err
			}
			items = append(items, v)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return items, nil
	}

	rows, err := s.db.Query(ctx, `
		SELECT vehicle_id, lat, lng
		FROM vehicles
		WHERE excluded_from_global_simulation = FALSE
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]simulationVehicle, 0, limit)
	for rows.Next() {
		var v simulationVehicle
		if err := rows.Scan(&v.VehicleID, &v.Lat, &v.Lng); err != nil {
			return nil, err
		}
		items = append(items, v)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (s *simulator) updateVehicleTelemetry(ctx context.Context, vehicleID string, lat, lng float64, status string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE vehicles
		SET lat = $2,
			lng = $3,
			status = $4
		WHERE vehicle_id = $1
	`, vehicleID, lat, lng, status)
	return err
}

func (s *simulator) sendToIngestion(ctx context.Context, vehicleID string, lat, lng, speedKmh float64, status string, panicButton bool, timestamp time.Time) (int, string, error) {
	payload := ingestionGPSPayload{
		VehicleID:   vehicleID,
		Lat:         lat,
		Lng:         lng,
		SpeedKmh:    speedKmh,
		Status:      status,
		PanicButton: panicButton,
		Timestamp:   timestamp.Format(time.RFC3339Nano),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return 0, "", err
	}
	return s.postIngestion(ctx, body)
}

func (s *simulator) sendMalformedToIngestion(ctx context.Context, vehicleID string, timestamp time.Time) (int, string, error) {
	body := []byte(fmt.Sprintf(`{"vehicle_id":"%s","lat":"abc","lng":-74.07,"timestamp":"%s"}`,
		vehicleID,
		timestamp.Format(time.RFC3339Nano),
	))
	return s.postIngestion(ctx, body)
}

func (s *simulator) postIngestion(ctx context.Context, body []byte) (int, string, error) {

	endpoint := s.ingestionBaseURL + "/api/v1/ingestion/gps"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBuffer(body))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.tokenProvider != nil {
		token, err := s.tokenProvider.AccessToken(ctx)
		if err != nil {
			return 0, "", err
		}
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	bodyRaw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	bodyText := strings.TrimSpace(string(bodyRaw))

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return resp.StatusCode, bodyText, nil
	}

	return resp.StatusCode, bodyText, fmt.Errorf("ingestion respondio %d: %s", resp.StatusCode, bodyText)
}

func (s *simulator) recordTransmission(entry simulationTransmission) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.traceSeq++
	entry.ID = s.traceSeq

	s.transmissions = append([]simulationTransmission{entry}, s.transmissions...)
	if len(s.transmissions) > maxTraceEntries {
		s.transmissions = s.transmissions[:maxTraceEntries]
	}
}

func (s *simulator) RecentTransmissions(limit int) []simulationTransmission {
	if limit <= 0 {
		limit = 100
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit > len(s.transmissions) {
		limit = len(s.transmissions)
	}

	items := make([]simulationTransmission, limit)
	copy(items, s.transmissions[:limit])
	return items
}

func classifyIngestionOutcome(statusCode int, body string, err error) (string, string) {
	if err != nil {
		if statusCode == http.StatusBadRequest {
			return "error_controlado", "Payload malformado enviado intencionalmente"
		}
		return "error", body
	}

	bodyLower := strings.ToLower(body)
	if strings.Contains(bodyLower, "duplicado_ignorado") {
		return "duplicado", "El ingestor detecto y descarto un duplicado"
	}

	if statusCode == http.StatusCreated || statusCode == http.StatusAccepted {
		return "ok", "Procesado correctamente"
	}

	return "ok", body
}

func (s *simulator) getSelectedCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.selectedCount
}

func (s *simulator) getTickMS() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tickMS
}

func (s *simulator) incrementRequests(delta int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requestsSent += delta
}

func (s *simulator) registerError(message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.errorsCount++
	s.lastError = message
}

func normalizeAngle(angle float64) float64 {
	for angle > math.Pi {
		angle -= 2 * math.Pi
	}
	for angle < -math.Pi {
		angle += 2 * math.Pi
	}
	return angle
}

func clampLat(value float64) float64 {
	if value < -90 {
		return -90
	}
	if value > 90 {
		return 90
	}
	return value
}

func clampLng(value float64) float64 {
	if value < -180 {
		return -180
	}
	if value > 180 {
		return 180
	}
	return value
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
