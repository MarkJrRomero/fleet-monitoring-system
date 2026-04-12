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

	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	db        *pgxpool.Pool
	simulator *simulator
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

func NewHandler(db *pgxpool.Pool, sim *simulator) *Handler {
	return &Handler{db: db, simulator: sim}
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

	totalVehicles, err := h.countVehicles(r.Context())
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
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE vehicles
		ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

		ALTER TABLE vehicles
		ADD COLUMN IF NOT EXISTS imei TEXT;

		UPDATE vehicles
		SET imei = CONCAT('86', LPAD(id::text, 13, '0'))
		WHERE imei IS NULL OR BTRIM(imei) = '';

		ALTER TABLE vehicles
		ALTER COLUMN imei SET NOT NULL;

		CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_id
		ON vehicles (vehicle_id);

		CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_imei_unique
		ON vehicles (imei);
	`)
	return err
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
	writeJSON(w, status, map[string]string{"error": message})
}
