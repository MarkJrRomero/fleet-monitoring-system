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

type simulator struct {
	db               *pgxpool.Pool
	ingestionBaseURL string
	client           *http.Client

	mu            sync.RWMutex
	running       bool
	selectedCount int
	tickMS        int
	requestsSent  int64
	errorsCount   int64
	startedAt     time.Time
	lastError     string
	cancel        context.CancelFunc
	motionByID    map[string]motionState
	batchCursor   int
}

const simulationBatchSize = 5

type motionState struct {
	headingRad   float64
	speedMps     float64
	turnRateRadS float64
}

type simulationVehicle struct {
	VehicleID string
	Lat       float64
	Lng       float64
}

type ingestionGPSPayload struct {
	VehicleID string  `json:"vehicle_id"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	SpeedKmh  float64 `json:"speed_kmh"`
	Timestamp string  `json:"timestamp"`
}

func NewSimulator(db *pgxpool.Pool, ingestionBaseURL string) *simulator {
	return &simulator{
		db:               db,
		ingestionBaseURL: strings.TrimRight(ingestionBaseURL, "/"),
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		motionByID: make(map[string]motionState),
	}
}

func (s *simulator) Start(selectedCount, tickMS int) error {
	if selectedCount <= 0 {
		return errors.New("selected_count debe ser mayor a 0")
	}
	if selectedCount > 5000 {
		return errors.New("selected_count excede maximo permitido (5000)")
	}
	if tickMS < 200 {
		return errors.New("tick_ms minimo permitido: 200")
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
	s.batchCursor = 0

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
	s.tickMS = 1500
	s.requestsSent = 0
	s.errorsCount = 0
	s.startedAt = time.Time{}
	s.lastError = ""
	s.cancel = nil
	s.motionByID = make(map[string]motionState)
	s.batchCursor = 0
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
	batch := s.nextBatch(vehicles, simulationBatchSize)
	if len(batch) == 0 {
		return nil
	}

	base := time.Now().UTC()
	deltaSeconds := float64(s.getTickMS()) / 1000.0
	for idx, vehicle := range batch {
		lat, lng, speedKmh := s.nextPosition(vehicle.VehicleID, vehicle.Lat, vehicle.Lng, deltaSeconds)

		if err := s.updateVehiclePosition(ctx, vehicle.VehicleID, lat, lng); err != nil {
			s.registerError(err.Error())
			continue
		}

		timestamp := base.Add(time.Duration(idx) * 200 * time.Millisecond)
		if err := s.sendToIngestion(ctx, vehicle.VehicleID, lat, lng, speedKmh, timestamp); err != nil {
			s.registerError(err.Error())
			continue
		}

		s.incrementRequests(1)
	}

	return nil
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

func (s *simulator) loadVehicles(ctx context.Context, limit int) ([]simulationVehicle, error) {
	rows, err := s.db.Query(ctx, `
		SELECT vehicle_id, lat, lng
		FROM vehicles
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

func (s *simulator) updateVehiclePosition(ctx context.Context, vehicleID string, lat, lng float64) error {
	_, err := s.db.Exec(ctx, `
		UPDATE vehicles
		SET lat = $2,
			lng = $3
		WHERE vehicle_id = $1
	`, vehicleID, lat, lng)
	return err
}

func (s *simulator) sendToIngestion(ctx context.Context, vehicleID string, lat, lng, speedKmh float64, timestamp time.Time) error {
	payload := ingestionGPSPayload{
		VehicleID: vehicleID,
		Lat:       lat,
		Lng:       lng,
		SpeedKmh:  speedKmh,
		Timestamp: timestamp.Format(time.RFC3339Nano),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	endpoint := s.ingestionBaseURL + "/api/v1/ingestion/gps"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("ingestion respondio %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}

	return nil
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
