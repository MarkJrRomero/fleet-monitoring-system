package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"fleet-monitoring-system/services/ingestion-service/internal/ingestion"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	ctx := context.Background()

	cfg := loadConfig()

	db, err := pgxpool.New(ctx, cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("no se pudo conectar a postgres: %v", err)
	}
	defer db.Close()

	if err := ingestion.EnsureSchema(ctx, db); err != nil {
		log.Fatalf("no se pudo asegurar schema: %v", err)
	}

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("no se pudo conectar a redis: %v", err)
	}
	defer redisClient.Close()

	h := ingestion.NewHandler(redisClient, db, ingestion.Config{
		RecentTTLSeconds:    cfg.RecentTTLSeconds,
		DedupeWindowSeconds: cfg.DedupeWindowSeconds,
		PositionsChannel:    cfg.RedisPositionsChannel,
		NominatimBaseURL:    cfg.NominatimBaseURL,
		NominatimUserAgent:  cfg.NominatimUserAgent,
	})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("GET /api/v1/vehicles", h.ListVehicles)
	mux.HandleFunc("POST /api/v1/vehicles/bulk", h.CreateVehiclesBulk)
	mux.HandleFunc("POST /api/v1/ingestion/gps", h.IngestGPS)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("ingestion-service escuchando en :%d", cfg.Port)
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

type config struct {
	Port                  int
	RedisAddr             string
	PostgresDSN           string
	RecentTTLSeconds      int
	DedupeWindowSeconds   int
	RedisPositionsChannel string
	NominatimBaseURL      string
	NominatimUserAgent    string
}

func loadConfig() config {
	port := envInt("INGESTION_SERVICE_PORT", 8091)
	host := envString("POSTGRES_HOST", "postgres")
	pgPort := envString("POSTGRES_PORT", "5432")
	db := envString("POSTGRES_DB", "fleet_monitoring")
	user := envString("POSTGRES_USER", "fleet_user")
	password := envString("POSTGRES_PASSWORD", "fleet_password")
	sslMode := envString("POSTGRES_SSLMODE", "disable")
	redisAddr := envString("REDIS_ADDR", "")
	if redisAddr == "" {
		redisAddr = parseRedisAddr(envString("REDIS_URL", "redis://redis:6379"))
	}

	postgresDSN := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		user,
		password,
		host,
		pgPort,
		db,
		sslMode,
	)

	return config{
		Port:                  port,
		RedisAddr:             redisAddr,
		PostgresDSN:           postgresDSN,
		RecentTTLSeconds:      envInt("INGESTION_RECENT_TTL_SECONDS", 60),
		DedupeWindowSeconds:   envInt("INGESTION_DEDUPE_WINDOW_SECONDS", 15),
		RedisPositionsChannel: envString("REDIS_POSITIONS_CHANNEL", "gps:stream"),
		NominatimBaseURL:      envString("NOMINATIM_REVERSE_URL", "https://nominatim.openstreetmap.org/reverse"),
		NominatimUserAgent:    envString("NOMINATIM_USER_AGENT", "fleet-monitoring-system/1.0 (dev)"),
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
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

func parseRedisAddr(redisURL string) string {
	trimmed := strings.TrimSpace(redisURL)
	if trimmed == "" {
		return "redis:6379"
	}
	trimmed = strings.TrimPrefix(trimmed, "redis://")
	if idx := strings.Index(trimmed, "/"); idx >= 0 {
		trimmed = trimmed[:idx]
	}
	if trimmed == "" {
		return "redis:6379"
	}
	return trimmed
}
