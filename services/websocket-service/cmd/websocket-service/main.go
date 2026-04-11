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

	"fleet-monitoring-system/services/websocket-service/internal/ws"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type config struct {
	Port          int
	RedisAddr     string
	RedisChannel  string
	AlertsChannel string
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

func main() {
	cfg := loadConfig()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("no se pudo conectar a redis: %v", err)
	}
	defer redisClient.Close()

	positionsHub := ws.NewHub()
	alertsHub := ws.NewHub()
	go positionsHub.SubscribeRedis(ctx, redisClient, cfg.RedisChannel)
	go alertsHub.SubscribeRedis(ctx, redisClient, cfg.AlertsChannel)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("GET /ws/positions", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		positionsHub.AddClient(conn)

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				positionsHub.RemoveClient(conn)
				break
			}
		}
	})

	mux.HandleFunc("GET /ws/alerts", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		alertsHub.AddClient(conn)

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				alertsHub.RemoveClient(conn)
				break
			}
		}
	})

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("websocket-service escuchando en :%d", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("error en servidor websocket: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown con error: %v", err)
	}
}

func loadConfig() config {
	port := envInt("WEBSOCKET_SERVICE_PORT", 8093)
	redisAddr := envString("REDIS_ADDR", "")
	if redisAddr == "" {
		redisAddr = parseRedisAddr(envString("REDIS_URL", "redis://redis:6379"))
	}

	return config{
		Port:          port,
		RedisAddr:     redisAddr,
		RedisChannel:  envString("REDIS_POSITIONS_CHANNEL", "gps:stream"),
		AlertsChannel: envString("REDIS_ALERTS_CHANNEL", "alerts:stream"),
	}
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
