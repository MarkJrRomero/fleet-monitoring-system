package ingestion

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Config struct {
	RecentTTLSeconds    int
	DedupeWindowSeconds int
	PositionsChannel    string
	NominatimBaseURL    string
	NominatimUserAgent  string
}

type Handler struct {
	redis    *redis.Client
	db       *pgxpool.Pool
	config   Config
	geocoder *ReverseGeocoder
}

type gpsIngestRequest struct {
	VehicleID string      `json:"vehicle_id"`
	Lat       float64     `json:"lat"`
	Lng       float64     `json:"lng"`
	SpeedKmh  *float64    `json:"speed_kmh,omitempty"`
	Timestamp interface{} `json:"timestamp"`
}

type ingestResponse struct {
	Status    string `json:"status"`
	VehicleID string `json:"vehicle_id"`
	Recorded  string `json:"recorded_at"`
}

type vehicle struct {
	VehicleID string    `json:"vehicle_id"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	CreatedAt time.Time `json:"created_at"`
}

type bulkCreateVehiclesRequest struct {
	Count int `json:"count"`
}

type bulkCreateVehiclesResponse struct {
	Created int `json:"created"`
	Total   int `json:"total"`
}

type listVehiclesResponse struct {
	Vehicles []vehicle `json:"vehicles"`
	Total    int       `json:"total"`
}

type positionEnrichment struct {
	SpeedKmh float64          `json:"speed_kmh"`
	Location *ReverseLocation `json:"location,omitempty"`
}

const (
	bogotaBaseLat = 4.7110
	bogotaBaseLng = -74.0721
)

func NewHandler(redisClient *redis.Client, dbPool *pgxpool.Pool, cfg Config) *Handler {
	return &Handler{
		redis:    redisClient,
		db:       dbPool,
		config:   cfg,
		geocoder: NewReverseGeocoder(cfg.NominatimBaseURL, cfg.NominatimUserAgent),
	}
}

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) IngestGPS(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req gpsIngestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "payload invalido")
		return
	}

	recordedAt, err := parseTimestamp(req.Timestamp)
	if err != nil {
		writeError(w, http.StatusBadRequest, "timestamp invalido: usa RFC3339 o unix epoch")
		return
	}

	if err := validateRequest(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	isDuplicate, err := h.isDuplicate(ctx, req, recordedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error en anti-duplicados")
		return
	}

	if isDuplicate {
		writeJSON(w, http.StatusAccepted, ingestResponse{
			Status:    "duplicado_ignorado",
			VehicleID: req.VehicleID,
			Recorded:  recordedAt.UTC().Format(time.RFC3339),
		})
		return
	}

	enrichment := h.enrichPosition(ctx, req)

	if err := h.cacheRecentCoordinate(ctx, req, recordedAt, enrichment); err != nil {
		writeError(w, http.StatusInternalServerError, "error guardando cache reciente")
		return
	}

	if err := h.persistHistoricalCoordinate(ctx, req, recordedAt, enrichment); err != nil {
		writeError(w, http.StatusInternalServerError, "error persistiendo historico")
		return
	}

	if err := h.publishPositionEvent(ctx, req, recordedAt, enrichment); err != nil {
		writeError(w, http.StatusInternalServerError, "error publicando evento de posicion")
		return
	}

	writeJSON(w, http.StatusCreated, ingestResponse{
		Status:    "almacenado",
		VehicleID: req.VehicleID,
		Recorded:  recordedAt.UTC().Format(time.RFC3339),
	})
}

func (h *Handler) ListVehicles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := h.db.Query(ctx, `
		SELECT vehicle_id, lat, lng, created_at
		FROM vehicles
		ORDER BY created_at ASC
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error consultando vehiculos")
		return
	}
	defer rows.Close()

	vehicles := make([]vehicle, 0)
	for rows.Next() {
		var item vehicle
		if err := rows.Scan(&item.VehicleID, &item.Lat, &item.Lng, &item.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "error leyendo vehiculos")
			return
		}
		vehicles = append(vehicles, item)
	}

	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "error iterando vehiculos")
		return
	}

	writeJSON(w, http.StatusOK, listVehiclesResponse{
		Vehicles: vehicles,
		Total:    len(vehicles),
	})
}

func (h *Handler) CreateVehiclesBulk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	req := bulkCreateVehiclesRequest{Count: 100}
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

	startIndex, err := h.nextVehicleNumericIndex(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error calculando indice de vehiculos")
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
		id := fmt.Sprintf("SIM-%05d", startIndex+i)
		lat := bogotaBaseLat + (rnd.Float64()-0.5)*0.05
		lng := bogotaBaseLng + (rnd.Float64()-0.5)*0.05

		tag, execErr := tx.Exec(ctx, `
			INSERT INTO vehicles (vehicle_id, lat, lng)
			VALUES ($1, $2, $3)
			ON CONFLICT (vehicle_id) DO NOTHING
		`, id, lat, lng)
		if execErr != nil {
			writeError(w, http.StatusInternalServerError, "error creando vehiculos")
			return
		}
		if tag.RowsAffected() > 0 {
			created++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "error confirmando creacion de vehiculos")
		return
	}

	total, err := h.countVehicles(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "error consultando total de vehiculos")
		return
	}

	writeJSON(w, http.StatusCreated, bulkCreateVehiclesResponse{
		Created: created,
		Total:   total,
	})
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

func (h *Handler) publishPositionEvent(ctx context.Context, req gpsIngestRequest, recordedAt time.Time, enrichment positionEnrichment) error {
	channel := strings.TrimSpace(h.config.PositionsChannel)
	if channel == "" {
		channel = "gps:stream"
	}

	payload := map[string]interface{}{
		"vehicle_id":  req.VehicleID,
		"lat":         req.Lat,
		"lng":         req.Lng,
		"speed_kmh":   enrichment.SpeedKmh,
		"location":    enrichment.Location,
		"recorded_at": recordedAt.UTC().Format(time.RFC3339),
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return h.redis.Publish(ctx, channel, data).Err()
}

func (h *Handler) isDuplicate(ctx context.Context, req gpsIngestRequest, recordedAt time.Time) (bool, error) {
	dedupeWindow := time.Duration(h.config.DedupeWindowSeconds) * time.Second
	if dedupeWindow <= 0 {
		dedupeWindow = 15 * time.Second
	}

	windowStart := recordedAt.UTC().Unix() / int64(dedupeWindow.Seconds()) * int64(dedupeWindow.Seconds())
	dedupeKey := fmt.Sprintf("gps:dedupe:%s:%.6f:%.6f:%d", req.VehicleID, req.Lat, req.Lng, windowStart)

	created, err := h.redis.SetNX(ctx, dedupeKey, "1", dedupeWindow).Result()
	if err != nil {
		return false, err
	}

	return !created, nil
}

func (h *Handler) cacheRecentCoordinate(ctx context.Context, req gpsIngestRequest, recordedAt time.Time, enrichment positionEnrichment) error {
	recentKey := fmt.Sprintf("gps:recent:%s", req.VehicleID)
	ttl := time.Duration(h.config.RecentTTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = 60 * time.Second
	}

	payload := map[string]interface{}{
		"vehicle_id":  req.VehicleID,
		"lat":         req.Lat,
		"lng":         req.Lng,
		"speed_kmh":   enrichment.SpeedKmh,
		"location":    enrichment.Location,
		"recorded_at": recordedAt.UTC().Format(time.RFC3339),
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return h.redis.Set(ctx, recentKey, data, ttl).Err()
}

func (h *Handler) persistHistoricalCoordinate(ctx context.Context, req gpsIngestRequest, recordedAt time.Time, enrichment positionEnrichment) error {
	location := enrichment.Location
	locationName := ""
	locationDisplayName := ""
	city := ""
	road := ""
	neighbourhood := ""
	country := ""
	if location != nil {
		locationName = location.Name
		locationDisplayName = location.DisplayName
		city = location.City
		road = location.Road
		neighbourhood = location.Neighbour
		country = location.Country
	}

	_, err := h.db.Exec(ctx, `
		INSERT INTO gps_locations (
			vehicle_id,
			lat,
			lng,
			speed_kmh,
			location_name,
			location_display_name,
			city,
			road,
			neighbourhood,
			country,
			recorded_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`,
		req.VehicleID,
		req.Lat,
		req.Lng,
		enrichment.SpeedKmh,
		locationName,
		locationDisplayName,
		city,
		road,
		neighbourhood,
		country,
		recordedAt.UTC(),
	)
	return err
}

func EnsureSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS vehicles (
			id BIGSERIAL PRIMARY KEY,
			vehicle_id TEXT NOT NULL UNIQUE,
			lat DOUBLE PRECISION NOT NULL,
			lng DOUBLE PRECISION NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS gps_locations (
			id BIGSERIAL PRIMARY KEY,
			vehicle_id TEXT NOT NULL,
			lat DOUBLE PRECISION NOT NULL,
			lng DOUBLE PRECISION NOT NULL,
			speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
			location_name TEXT NOT NULL DEFAULT '',
			location_display_name TEXT NOT NULL DEFAULT '',
			city TEXT NOT NULL DEFAULT '',
			road TEXT NOT NULL DEFAULT '',
			neighbourhood TEXT NOT NULL DEFAULT '',
			country TEXT NOT NULL DEFAULT '',
			recorded_at TIMESTAMPTZ NOT NULL,
			received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0;
		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS location_name TEXT NOT NULL DEFAULT '';
		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS location_display_name TEXT NOT NULL DEFAULT '';
		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS road TEXT NOT NULL DEFAULT '';
		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS neighbourhood TEXT NOT NULL DEFAULT '';
		ALTER TABLE gps_locations ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';

		CREATE INDEX IF NOT EXISTS idx_gps_locations_vehicle_recorded
		ON gps_locations (vehicle_id, recorded_at DESC);

		CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_id
		ON vehicles (vehicle_id);
	`)
	return err
}

func parseTimestamp(value interface{}) (time.Time, error) {
	switch v := value.(type) {
	case string:
		parsed, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return time.Time{}, err
		}
		return parsed, nil
	case float64:
		return time.Unix(int64(v), 0), nil
	default:
		return time.Time{}, errors.New("unsupported timestamp")
	}
}

func validateRequest(req gpsIngestRequest) error {
	req.VehicleID = strings.TrimSpace(req.VehicleID)
	if req.VehicleID == "" {
		return errors.New("vehicle_id es obligatorio")
	}
	if req.Lat < -90 || req.Lat > 90 {
		return errors.New("lat fuera de rango")
	}
	if req.Lng < -180 || req.Lng > 180 {
		return errors.New("lng fuera de rango")
	}
	return nil
}

func (h *Handler) enrichPosition(ctx context.Context, req gpsIngestRequest) positionEnrichment {
	enrichment := positionEnrichment{
		SpeedKmh: sanitizeSpeed(req.SpeedKmh),
	}

	location, err := h.geocoder.Reverse(ctx, req.Lat, req.Lng)
	if err == nil {
		enrichment.Location = location
	}

	return enrichment
}

func sanitizeSpeed(value *float64) float64 {
	if value == nil {
		return 0
	}
	speed := *value
	if speed < 0 {
		return 0
	}
	if speed > 220 {
		return 220
	}
	return speed
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
		"code":  strconv.Itoa(status),
	})
}
