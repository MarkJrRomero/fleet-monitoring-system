package vehicles

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	db              *pgxpool.Pool
	simulator       *simulator
	driverSimulator *simulator
	redis           *redis.Client
}

type apiErrorEnvelope struct {
	Error apiErrorBody `json:"error"`
}

type apiErrorBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Status    int    `json:"status"`
	Service   string `json:"service"`
	RequestID string `json:"request_id,omitempty"`
	Timestamp string `json:"timestamp"`
}

type Vehicle struct {
	VehicleID string    `json:"vehicle_id"`
	IMEI      string    `json:"imei"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type listVehiclesResponse struct {
	Vehicles []Vehicle `json:"vehicles"`
	Total    int       `json:"total"`
}

type bulkCreateRequest struct {
	Count int `json:"count"`
}

type bulkCreateResponse struct {
	Created int `json:"created"`
	Total   int `json:"total"`
}

type createVehicleRequest struct {
	VehicleID string  `json:"vehicle_id"`
	IMEI      string  `json:"imei"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Status    string  `json:"status"`
}

type updateVehicleRequest struct {
	Status *string `json:"status"`
}

type simulationStartRequest struct {
	SelectedCount int `json:"selected_count"`
	TickMS        int `json:"tick_ms"`
}

type simulationTraceResponse struct {
	Items []simulationTransmission `json:"items"`
}

type driverSimulationStartRequest struct {
	TickMS int `json:"tick_ms"`
}

type deleteScope string

const (
	deleteScopeVehicleOnly deleteScope = "vehicle_only"
	deleteScopeWithHistory deleteScope = "with_history"
)

const (
	DefaultDriverUsername    = "driver_test"
	DefaultDriverVehicleID   = "SIM-00001"
	DefaultDriverVehicleIMEI = "860000000000001"
)

var idPattern = regexp.MustCompile(`^[A-Z0-9_-]{3,40}$`)
var imeiPattern = regexp.MustCompile(`^[0-9]{15}$`)

const (
	bogotaBaseLat = 4.7110
	bogotaBaseLng = -74.0721
	bogotaMinLat  = 4.55
	bogotaMaxLat  = 4.85
	bogotaMinLng  = -74.25
	bogotaMaxLng  = -73.95
)

func NewHandler(db *pgxpool.Pool, sim *simulator, driverSim *simulator) *Handler {
	return &Handler{db: db, simulator: sim, driverSimulator: driverSim, redis: nil}
}

func NewHandlerWithCache(db *pgxpool.Pool, sim *simulator, driverSim *simulator, redisClient *redis.Client) *Handler {
	return &Handler{db: db, simulator: sim, driverSimulator: driverSim, redis: redisClient}
}

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) ListVehicles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := h.db.Query(ctx, `
		SELECT vehicle_id, imei, lat, lng, status, created_at
		FROM vehicles
		ORDER BY created_at ASC
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error consultando vehiculos")
		return
	}
	defer rows.Close()

	items := make([]Vehicle, 0)
	for rows.Next() {
		var v Vehicle
		if err := rows.Scan(&v.VehicleID, &v.IMEI, &v.Lat, &v.Lng, &v.Status, &v.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "error leyendo vehiculos")
			return
		}
		items = append(items, v)
	}

	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "error iterando vehiculos")
		return
	}

	writeJSON(w, http.StatusOK, listVehiclesResponse{Vehicles: items, Total: len(items)})
}

func (h *Handler) CreateVehiclesBulk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	req := bulkCreateRequest{Count: 100}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.Count <= 0 {
		req.Count = 100
	}
	if req.Count > 1000 {
		writeError(w, http.StatusBadRequest, "count excede maximo permitido (1000)")
		return
	}

	start, err := h.nextVehicleNumericIndex(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error calculando indice")
		return
	}

	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error iniciando transaccion")
		return
	}
	defer tx.Rollback(ctx)

	created := 0
	for i := 0; i < req.Count; i++ {
		id := fmt.Sprintf("SIM-%05d", start+i)
		imei := fmt.Sprintf("86%013d", start+i)
		lat := bogotaBaseLat + (rnd.Float64()-0.5)*0.05
		lng := bogotaBaseLng + (rnd.Float64()-0.5)*0.05

		tag, execErr := tx.Exec(ctx, `
			INSERT INTO vehicles (vehicle_id, imei, lat, lng, status)
			VALUES ($1, $2, $3, $4, 'online')
			ON CONFLICT (vehicle_id) DO NOTHING
		`, id, imei, lat, lng)
		if execErr != nil {
			writeError(w, http.StatusInternalServerError, "error creando vehiculos")
			return
		}
		if tag.RowsAffected() > 0 {
			created++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "error confirmando transaccion")
		return
	}

	total, err := h.countVehicles(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error consultando total")
		return
	}

	writeJSON(w, http.StatusCreated, bulkCreateResponse{Created: created, Total: total})
}

func (h *Handler) CreateVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req createVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "payload invalido")
		return
	}

	req.VehicleID = strings.ToUpper(strings.TrimSpace(req.VehicleID))
	req.IMEI = strings.TrimSpace(req.IMEI)
	if !idPattern.MatchString(req.VehicleID) {
		writeError(w, http.StatusBadRequest, "vehicle_id invalido")
		return
	}
	if !imeiPattern.MatchString(req.IMEI) {
		writeError(w, http.StatusBadRequest, "imei invalido: debe tener 15 digitos numericos")
		return
	}
	if req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 {
		writeError(w, http.StatusBadRequest, "lat/lng fuera de rango")
		return
	}
	req.Lat, req.Lng = clampToBogota(req.Lat, req.Lng)
	if req.Status == "" {
		req.Status = "online"
	}

	_, err := h.db.Exec(ctx, `
		INSERT INTO vehicles (vehicle_id, imei, lat, lng, status)
		VALUES ($1, $2, $3, $4, $5)
	`, req.VehicleID, req.IMEI, req.Lat, req.Lng, req.Status)
	if err != nil {
		writeError(w, http.StatusConflict, "vehicle_id o imei ya existe, o no pudo crearse")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"vehicle_id": req.VehicleID, "imei": req.IMEI, "status": "created"})
}

func (h *Handler) GetVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vehicleID, err := parseVehicleIDFromPath(r.URL.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var v Vehicle
	err = h.db.QueryRow(ctx, `
		SELECT vehicle_id, imei, lat, lng, status, created_at
		FROM vehicles
		WHERE vehicle_id = $1
	`, vehicleID).Scan(&v.VehicleID, &v.IMEI, &v.Lat, &v.Lng, &v.Status, &v.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "vehiculo no encontrado")
		return
	}

	writeJSON(w, http.StatusOK, v)
}

func (h *Handler) UpdateVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vehicleID, err := parseVehicleIDFromPath(r.URL.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "payload invalido")
		return
	}
	if req.Status == nil || strings.TrimSpace(*req.Status) == "" {
		writeError(w, http.StatusBadRequest, "status es obligatorio")
		return
	}

	tag, err := h.db.Exec(ctx, `
		UPDATE vehicles
		SET status = $2
		WHERE vehicle_id = $1
	`, vehicleID, strings.TrimSpace(*req.Status))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error actualizando vehiculo")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "vehiculo no encontrado")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"vehicle_id": vehicleID, "status": *req.Status})
}

func (h *Handler) DeleteVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vehicleID, err := parseVehicleIDFromPath(r.URL.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	scope, err := parseDeleteScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error iniciando transaccion")
		return
	}
	defer tx.Rollback(ctx)

	vehicleTag, err := tx.Exec(ctx, `DELETE FROM vehicles WHERE vehicle_id = $1`, vehicleID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error eliminando vehiculo")
		return
	}
	if vehicleTag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "vehiculo no encontrado")
		return
	}

	if scope == deleteScopeWithHistory {
		if _, err := tx.Exec(ctx, `DELETE FROM gps_locations WHERE vehicle_id = $1`, vehicleID); err != nil {
			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) || pgErr.Code != "42P01" {
				writeError(w, http.StatusInternalServerError, "error eliminando historico de gps")
				return
			}
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO vehicle_cache_invalidation_jobs (vehicle_id, status, next_attempt_at)
		VALUES ($1, 'pending', NOW())
	`, vehicleID); err != nil {
		writeError(w, http.StatusInternalServerError, "error registrando invalidacion de cache")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "error confirmando eliminacion")
		return
	}

	// Attempt immediate invalidation to reduce stale reads; retries are handled by worker.
	h.processCacheInvalidationBatch(context.Background(), 5)

	writeJSON(w, http.StatusOK, map[string]string{
		"vehicle_id":            vehicleID,
		"status":                "deleted",
		"scope":                 string(scope),
		"cache_consistency":     "eventual",
		"cache_invalidationJob": "queued",
	})
}

func parseDeleteScope(r *http.Request) (deleteScope, error) {
	raw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("scope")))
	if raw == "" {
		return deleteScopeWithHistory, nil
	}

	scope := deleteScope(raw)
	if scope != deleteScopeVehicleOnly && scope != deleteScopeWithHistory {
		return "", errors.New("scope invalido: usa vehicle_only o with_history")
	}

	return scope, nil
}

func (h *Handler) StartCacheInvalidationWorker(ctx context.Context, interval time.Duration) {
	if h.redis == nil {
		return
	}
	if interval <= 0 {
		interval = 5 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.processCacheInvalidationBatch(ctx, 50)
		}
	}
}

func (h *Handler) processCacheInvalidationBatch(ctx context.Context, limit int) {
	if h.redis == nil || limit <= 0 {
		return
	}

	rows, err := h.db.Query(ctx, `
		SELECT id, vehicle_id, attempts
		FROM vehicle_cache_invalidation_jobs
		WHERE status = 'pending' AND next_attempt_at <= NOW()
		ORDER BY id ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return
	}
	defer rows.Close()

	type invalidationJob struct {
		ID        int64
		VehicleID string
		Attempts  int
	}

	jobs := make([]invalidationJob, 0, limit)
	for rows.Next() {
		var job invalidationJob
		if scanErr := rows.Scan(&job.ID, &job.VehicleID, &job.Attempts); scanErr != nil {
			return
		}
		jobs = append(jobs, job)
	}

	for _, job := range jobs {
		invalidateErr := h.invalidateVehicleCache(ctx, job.VehicleID)
		if invalidateErr == nil {
			_, _ = h.db.Exec(ctx, `
				UPDATE vehicle_cache_invalidation_jobs
				SET status = 'done', updated_at = NOW(), last_error = ''
				WHERE id = $1
			`, job.ID)
			continue
		}

		_, _ = h.db.Exec(ctx, `
			UPDATE vehicle_cache_invalidation_jobs
			SET attempts = attempts + 1,
				updated_at = NOW(),
				last_error = $2,
				next_attempt_at = NOW() + make_interval(secs => LEAST(300, (attempts + 1) * 10))
			WHERE id = $1
		`, job.ID, invalidateErr.Error())
	}
}

func (h *Handler) invalidateVehicleCache(ctx context.Context, vehicleID string) error {
	if h.redis == nil {
		return nil
	}

	directKeys := []string{
		fmt.Sprintf("gps:recent:%s", vehicleID),
		fmt.Sprintf("gps:last:%s", vehicleID),
		fmt.Sprintf("alert:overspeed:%s", vehicleID),
		fmt.Sprintf("alert:panic:%s", vehicleID),
	}

	var lastErr error
	if err := h.redis.Del(ctx, directKeys...).Err(); err != nil {
		lastErr = err
	}

	patterns := []string{
		fmt.Sprintf("gps:dedupe:%s:*", vehicleID),
		fmt.Sprintf("alert:stopped:%s:*", vehicleID),
	}

	for _, pattern := range patterns {
		if err := h.deleteKeysByPattern(ctx, pattern); err != nil {
			lastErr = err
		}
	}

	return lastErr
}

func (h *Handler) deleteKeysByPattern(ctx context.Context, pattern string) error {
	if h.redis == nil {
		return nil
	}

	var cursor uint64
	for {
		keys, nextCursor, err := h.redis.Scan(ctx, cursor, pattern, 200).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			if delErr := h.redis.Del(ctx, keys...).Err(); delErr != nil {
				return delErr
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return nil
}

func (h *Handler) GetSimulationStatus(w http.ResponseWriter, _ *http.Request) {
	if h.simulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador no disponible")
		return
	}

	writeJSON(w, http.StatusOK, h.simulator.Status())
}

func (h *Handler) StartSimulation(w http.ResponseWriter, r *http.Request) {
	if h.simulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador no disponible")
		return
	}

	req := simulationStartRequest{SelectedCount: 50, TickMS: 1000}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "payload invalido")
			return
		}
	}

	totalVehicles, err := h.countSimulatableVehicles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "no fue posible contar vehiculos disponibles")
		return
	}
	if totalVehicles <= 0 {
		writeError(w, http.StatusBadRequest, "no hay vehiculos disponibles para simular")
		return
	}
	if req.SelectedCount <= 0 {
		req.SelectedCount = minInt(totalVehicles, 50)
	}
	if req.SelectedCount > totalVehicles {
		req.SelectedCount = totalVehicles
	}
	if req.TickMS <= 0 {
		req.TickMS = 1000
	}

	if err := h.simulator.Start(req.SelectedCount, req.TickMS); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, h.simulator.Status())
}

func (h *Handler) GetDriverSimulationStatus(w http.ResponseWriter, _ *http.Request) {
	if h.driverSimulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador de conductor no disponible")
		return
	}

	writeJSON(w, http.StatusOK, h.driverSimulator.Status())
}

func (h *Handler) StartDriverSimulation(w http.ResponseWriter, r *http.Request) {
	if h.driverSimulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador de conductor no disponible")
		return
	}

	req := driverSimulationStartRequest{TickMS: 1000}
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "payload invalido")
			return
		}
	}
	if req.TickMS <= 0 {
		req.TickMS = 1000
	}

	if err := h.driverSimulator.Start(1, req.TickMS); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, h.driverSimulator.Status())
}

func (h *Handler) StopDriverSimulation(w http.ResponseWriter, _ *http.Request) {
	if h.driverSimulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador de conductor no disponible")
		return
	}

	h.driverSimulator.Stop()
	writeJSON(w, http.StatusOK, h.driverSimulator.Status())
}

func (h *Handler) GetSimulationTrace(w http.ResponseWriter, r *http.Request) {
	if h.simulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador no disponible")
		return
	}

	items := h.simulator.RecentTransmissions(200)
	writeJSON(w, http.StatusOK, simulationTraceResponse{Items: items})
}

func (h *Handler) StopSimulation(w http.ResponseWriter, _ *http.Request) {
	if h.simulator == nil {
		writeError(w, http.StatusServiceUnavailable, "simulador no disponible")
		return
	}

	h.simulator.Stop()
	writeJSON(w, http.StatusOK, h.simulator.Status())
}

func (h *Handler) ClearDatabase(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if h.simulator != nil {
		h.simulator.Stop()
		h.simulator.ResetState()
	}
	if h.driverSimulator != nil {
		h.driverSimulator.Stop()
		h.driverSimulator.ResetState()
	}

	_, err := h.db.Exec(ctx, `
		DO $$
		BEGIN
			IF to_regclass('public.gps_locations') IS NOT NULL THEN
				TRUNCATE TABLE gps_locations RESTART IDENTITY;
			END IF;
			TRUNCATE TABLE vehicles RESTART IDENTITY CASCADE;
		END
		$$;
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error limpiando base de datos")
		return
	}

	if err := seedDefaultDriverVehicle(ctx, h.db); err != nil {
		writeError(w, http.StatusInternalServerError, "error recreando vehiculo por defecto del conductor")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"vehicles": 0,
	})
}

func EnsureSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS vehicles (
			id BIGSERIAL PRIMARY KEY,
			vehicle_id TEXT NOT NULL UNIQUE,
			imei TEXT,
			lat DOUBLE PRECISION NOT NULL,
			lng DOUBLE PRECISION NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			assigned_username TEXT NOT NULL DEFAULT '',
			excluded_from_global_simulation BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE vehicles
		ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

		ALTER TABLE vehicles
		ADD COLUMN IF NOT EXISTS imei TEXT;

		ALTER TABLE vehicles
		ADD COLUMN IF NOT EXISTS assigned_username TEXT NOT NULL DEFAULT '';

		ALTER TABLE vehicles
		ADD COLUMN IF NOT EXISTS excluded_from_global_simulation BOOLEAN NOT NULL DEFAULT FALSE;

		UPDATE vehicles
		SET imei = CONCAT('86', LPAD(id::text, 13, '0'))
		WHERE imei IS NULL OR BTRIM(imei) = '';

		ALTER TABLE vehicles
		ALTER COLUMN imei SET NOT NULL;

		CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_id
		ON vehicles (vehicle_id);

		CREATE INDEX IF NOT EXISTS idx_vehicles_excluded_from_global_simulation
		ON vehicles (excluded_from_global_simulation);

		CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_imei_unique
		ON vehicles (imei);

		CREATE TABLE IF NOT EXISTS vehicle_cache_invalidation_jobs (
			id BIGSERIAL PRIMARY KEY,
			vehicle_id TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			attempts INTEGER NOT NULL DEFAULT 0,
			last_error TEXT NOT NULL DEFAULT '',
			next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_vehicle_cache_invalidation_jobs_pending
		ON vehicle_cache_invalidation_jobs (status, next_attempt_at);
	`)
	if err != nil {
		return err
	}

	return seedDefaultDriverVehicle(ctx, db)
}

func (h *Handler) nextVehicleNumericIndex(ctx context.Context) (int, error) {
	var maxIndex int
	err := h.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(CAST(SUBSTRING(vehicle_id FROM 5) AS INTEGER)), 0)
		FROM vehicles
		WHERE vehicle_id ~ '^SIM-[0-9]+$'
	`).Scan(&maxIndex)
	if err != nil {
		return 0, err
	}
	return maxIndex + 1, nil
}

func (h *Handler) countVehicles(ctx context.Context) (int, error) {
	var total int
	err := h.db.QueryRow(ctx, `SELECT COUNT(*) FROM vehicles`).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (h *Handler) countSimulatableVehicles(ctx context.Context) (int, error) {
	var total int
	err := h.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM vehicles
		WHERE excluded_from_global_simulation = FALSE
	`).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func seedDefaultDriverVehicle(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		INSERT INTO vehicles (vehicle_id, imei, lat, lng, status, assigned_username, excluded_from_global_simulation)
		VALUES ($1, $2, $3, $4, 'online', $5, TRUE)
		ON CONFLICT (vehicle_id) DO UPDATE
		SET imei = EXCLUDED.imei,
			lat = EXCLUDED.lat,
			lng = EXCLUDED.lng,
			assigned_username = EXCLUDED.assigned_username,
			excluded_from_global_simulation = EXCLUDED.excluded_from_global_simulation
	`, DefaultDriverVehicleID, DefaultDriverVehicleIMEI, bogotaBaseLat, bogotaBaseLng, DefaultDriverUsername)
	return err
}

func parseVehicleIDFromPath(path string) (string, error) {
	const prefix = "/api/v1/vehicles/"
	if !strings.HasPrefix(path, prefix) {
		return "", errors.New("path invalido")
	}
	id := strings.TrimSpace(strings.TrimPrefix(path, prefix))
	id = strings.ToUpper(id)
	if !idPattern.MatchString(id) {
		return "", errors.New("vehicle_id invalido")
	}
	return id, nil
}

func clampToBogota(lat, lng float64) (float64, float64) {
	if lat < bogotaMinLat {
		lat = bogotaMinLat
	}
	if lat > bogotaMaxLat {
		lat = bogotaMaxLat
	}
	if lng < bogotaMinLng {
		lng = bogotaMinLng
	}
	if lng > bogotaMaxLng {
		lng = bogotaMaxLng
	}
	return lat, lng
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, apiErrorEnvelope{
		Error: apiErrorBody{
			Code:      defaultErrorCode(status),
			Message:   message,
			Status:    status,
			Service:   "vehicle-service",
			RequestID: w.Header().Get("X-Request-Id"),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		},
	})
}

func defaultErrorCode(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "BAD_REQUEST"
	case http.StatusNotFound:
		return "NOT_FOUND"
	case http.StatusConflict:
		return "CONFLICT"
	case http.StatusServiceUnavailable:
		return "SERVICE_UNAVAILABLE"
	case http.StatusUnauthorized:
		return "UNAUTHORIZED"
	case http.StatusForbidden:
		return "FORBIDDEN"
	default:
		if status >= 500 {
			return "INTERNAL_ERROR"
		}
		return "REQUEST_ERROR"
	}
}
