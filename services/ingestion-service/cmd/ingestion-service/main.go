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
	"sync/atomic"
	"syscall"
	"time"

	auth "fleet-monitoring-system/services/common-auth"
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
		RecentTTLSeconds:        cfg.RecentTTLSeconds,
		DedupeWindowSeconds:     cfg.DedupeWindowSeconds,
		PositionsChannel:        cfg.RedisPositionsChannel,
		NominatimBaseURL:        cfg.NominatimBaseURL,
		NominatimUserAgent:      cfg.NominatimUserAgent,
		AlertsChannel:           cfg.AlertsChannel,
		RoutingServiceURL:       cfg.RoutingServiceURL,
		RetryQueueSize:          cfg.RetryQueueSize,
		CBFailureThreshold:      cfg.CBFailureThreshold,
		CBResetSeconds:          cfg.CBResetSeconds,
		ClickHouseEnabled:       cfg.ClickHouseEnabled,
		ClickHouseAddr:          cfg.ClickHouseAddr,
		ClickHouseDatabase:      cfg.ClickHouseDatabase,
		ClickHouseUsername:      cfg.ClickHouseUsername,
		ClickHousePassword:      cfg.ClickHousePassword,
		ClickHouseBatchSize:     cfg.ClickHouseBatchSize,
		ClickHouseFlushInterval: cfg.ClickHouseFlushInterval,
	})
	authMiddleware, err := auth.NewMiddleware(auth.Config{
		ServiceName:     "ingestion-service",
		KeycloakBaseURL: cfg.KeycloakBaseURL,
		KeycloakHost:    cfg.KeycloakHost,
		Realm:           cfg.KeycloakRealm,
		ClientID:        cfg.KeycloakClientID,
		ClientSecret:    cfg.KeycloakSecret,
		ExemptPaths:     []string{"/health"},
	})
	if err != nil {
		log.Fatalf("no se pudo configurar auth middleware: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("GET /api/v1/vehicles", h.ListVehicles)
	mux.HandleFunc("POST /api/v1/vehicles/bulk", h.CreateVehiclesBulk)
	mux.HandleFunc("POST /api/v1/ingestion/gps", h.IngestGPS)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           withRequestID(withCORS(authMiddleware.Wrap(mux))),
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

var requestCounter uint64

func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := strings.TrimSpace(r.Header.Get("X-Request-Id"))
		if requestID == "" {
			requestID = fmt.Sprintf("ing-%d-%d", time.Now().UnixNano(), atomic.AddUint64(&requestCounter, 1))
		}
		r.Header.Set("X-Request-Id", requestID)
		w.Header().Set("X-Request-Id", requestID)
		next.ServeHTTP(w, r)
	})
}

type config struct {
	Port                    int
	RedisAddr               string
	PostgresDSN             string
	KeycloakBaseURL         string
	KeycloakHost            string
	KeycloakRealm           string
	KeycloakClientID        string
	KeycloakSecret          string
	RecentTTLSeconds        int
	DedupeWindowSeconds     int
	RedisPositionsChannel   string
	NominatimBaseURL        string
	NominatimUserAgent      string
	AlertsChannel           string
	RoutingServiceURL       string
	RetryQueueSize          int
	CBFailureThreshold      int
	CBResetSeconds          int
	ClickHouseEnabled       bool
	ClickHouseAddr          string
	ClickHouseDatabase      string
	ClickHouseUsername      string
	ClickHousePassword      string
	ClickHouseBatchSize     int
	ClickHouseFlushInterval time.Duration
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
		Port:                    port,
		RedisAddr:               redisAddr,
		PostgresDSN:             postgresDSN,
		KeycloakBaseURL:         envString("KEYCLOAK_BASE_URL", "http://host.docker.internal:8080"),
		KeycloakHost:            envString("KEYCLOAK_HOST_HEADER", "localhost:8080"),
		KeycloakRealm:           envString("KEYCLOAK_REALM", "fleet-monitoring"),
		KeycloakClientID:        envString("KEYCLOAK_AUTH_CLIENT_ID", "ingestion-service"),
		KeycloakSecret:          envString("KEYCLOAK_AUTH_CLIENT_SECRET", "tu-secreto-muy-seguro"),
		RecentTTLSeconds:        envInt("INGESTION_RECENT_TTL_SECONDS", 60),
		DedupeWindowSeconds:     envInt("INGESTION_DEDUPE_WINDOW_SECONDS", 15),
		RedisPositionsChannel:   envString("REDIS_POSITIONS_CHANNEL", "gps:stream"),
		NominatimBaseURL:        envString("NOMINATIM_REVERSE_URL", "https://nominatim.openstreetmap.org/reverse"),
		NominatimUserAgent:      envString("NOMINATIM_USER_AGENT", "fleet-monitoring-system/1.0 (dev)"),
		AlertsChannel:           envString("ALERTS_CHANNEL", "alerts:stream"),
		RoutingServiceURL:       envString("ROUTING_SERVICE_URL", "http://routing-service:8095"),
		RetryQueueSize:          envInt("INGESTION_RETRY_QUEUE_SIZE", 1000),
		CBFailureThreshold:      envInt("INGESTION_CB_FAILURE_THRESHOLD", 3),
		CBResetSeconds:          envInt("INGESTION_CB_RESET_SECONDS", 30),
		ClickHouseEnabled:       envBool("CLICKHOUSE_ENABLED", true),
		ClickHouseAddr:          envString("CLICKHOUSE_ADDR", "clickhouse:9000"),
		ClickHouseDatabase:      envString("CLICKHOUSE_DATABASE", "default"),
		ClickHouseUsername:      envString("CLICKHOUSE_USERNAME", "default"),
		ClickHousePassword:      envString("CLICKHOUSE_PASSWORD", ""),
		ClickHouseBatchSize:     envInt("CLICKHOUSE_BATCH_SIZE", 100),
		ClickHouseFlushInterval: time.Duration(envInt("CLICKHOUSE_FLUSH_INTERVAL_SECONDS", 3)) * time.Second,
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

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(envString(key, "")))
	if value == "" {
		return fallback
	}

	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
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
