package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"fleet-monitoring-system/services/vehicle-service/internal/vehicles"

	"github.com/jackc/pgx/v5/pgxpool"
)

type config struct {
	Port             int
	PostgresDSN      string
	IngestionBaseURL string
}

func main() {
	cfg := loadConfig()
	ctx := context.Background()

	db, err := pgxpool.New(ctx, cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("no se pudo conectar a postgres: %v", err)
	}
	defer db.Close()

	if err := vehicles.EnsureSchema(ctx, db); err != nil {
		log.Fatalf("no se pudo asegurar schema de vehicles: %v", err)
	}

	sim := vehicles.NewSimulator(db, cfg.IngestionBaseURL)
	h := vehicles.NewHandler(db, sim)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("GET /api/v1/vehicles", h.ListVehicles)
	mux.HandleFunc("POST /api/v1/vehicles", h.CreateVehicle)
	mux.HandleFunc("POST /api/v1/vehicles/bulk", h.CreateVehiclesBulk)
	mux.HandleFunc("GET /api/v1/vehicles/", h.GetVehicle)
	mux.HandleFunc("PATCH /api/v1/vehicles/", h.UpdateVehicle)
	mux.HandleFunc("GET /api/v1/simulation/status", h.GetSimulationStatus)
	mux.HandleFunc("GET /api/v1/simulation/trace", h.GetSimulationTrace)
	mux.HandleFunc("POST /api/v1/simulation/start", h.StartSimulation)
	mux.HandleFunc("POST /api/v1/simulation/stop", h.StopSimulation)
	mux.HandleFunc("POST /api/v1/admin/clear-db", h.ClearDatabase)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("vehicle-service escuchando en :%d", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("error en servidor HTTP: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown con error: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func loadConfig() config {
	port := envInt("VEHICLE_SERVICE_PORT", 8094)
	host := envString("POSTGRES_HOST", "postgres")
	pgPort := envString("POSTGRES_PORT", "5432")
	db := envString("POSTGRES_DB", "fleet_monitoring")
	user := envString("POSTGRES_USER", "fleet_user")
	password := envString("POSTGRES_PASSWORD", "fleet_password")
	sslMode := envString("POSTGRES_SSLMODE", "disable")
	ingestionBaseURL := envString("INGESTION_BASE_URL", "http://ingestion-service:8091")

	postgresDSN := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		user,
		password,
		host,
		pgPort,
		db,
		sslMode,
	)

	return config{Port: port, PostgresDSN: postgresDSN, IngestionBaseURL: ingestionBaseURL}
}

func envString(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value := envString(key, "")
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
