package ingestion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

type persistenceJob struct {
	Request    gpsIngestRequest
	RecordedAt time.Time
	Enriched   positionEnrichment
	Attempts   int
}

type routingJob struct {
	Payload  map[string]interface{}
	Attempts int
}

type resilienceConfig struct {
	QueueSize        int
	FailureThreshold int
	ResetTimeout     time.Duration
}

func defaultResilienceConfig() resilienceConfig {
	return resilienceConfig{
		QueueSize:        1000,
		FailureThreshold: 3,
		ResetTimeout:     30 * time.Second,
	}
}

func (h *Handler) initResilience(cfg resilienceConfig) {
	if cfg.QueueSize <= 0 {
		cfg.QueueSize = 1000
	}
	if cfg.FailureThreshold <= 0 {
		cfg.FailureThreshold = 3
	}
	if cfg.ResetTimeout <= 0 {
		cfg.ResetTimeout = 30 * time.Second
	}

	h.persistenceBreaker = NewCircuitBreaker(cfg.FailureThreshold, cfg.ResetTimeout)
	h.routingBreaker = NewCircuitBreaker(cfg.FailureThreshold, cfg.ResetTimeout)
	h.persistenceQueue = make(chan persistenceJob, cfg.QueueSize)
	h.routingQueue = make(chan routingJob, cfg.QueueSize)

	go h.persistenceRetryWorker()
	go h.routingRetryWorker()
}

func (h *Handler) persistWithResilience(ctx context.Context, req gpsIngestRequest, recordedAt time.Time, enrichment positionEnrichment) {
	err := h.persistenceBreaker.Execute(func() error {
		return h.persistHistoricalCoordinate(ctx, req, recordedAt, enrichment)
	})
	if err == nil {
		return
	}

	h.enqueuePersistence(persistenceJob{
		Request:    req,
		RecordedAt: recordedAt,
		Enriched:   enrichment,
		Attempts:   1,
	})
}

func (h *Handler) routeWithResilience(ctx context.Context, payload map[string]interface{}) {
	if strings.TrimSpace(h.config.RoutingServiceURL) == "" {
		return
	}

	err := h.routingBreaker.Execute(func() error {
		return h.sendToRoutingService(ctx, payload)
	})
	if err == nil {
		return
	}

	h.enqueueRouting(routingJob{Payload: payload, Attempts: 1})
}

func (h *Handler) enqueuePersistence(job persistenceJob) {
	select {
	case h.persistenceQueue <- job:
	default:
		log.Printf("cola de persistencia llena, descartando job vehicle_id=%s", job.Request.VehicleID)
	}
}

func (h *Handler) enqueueRouting(job routingJob) {
	select {
	case h.routingQueue <- job:
	default:
		if vehicleID, ok := job.Payload["vehicle_id"].(string); ok {
			log.Printf("cola de ruteo llena, descartando job vehicle_id=%s", vehicleID)
			return
		}
		log.Printf("cola de ruteo llena, descartando job")
	}
}

func (h *Handler) persistenceRetryWorker() {
	for job := range h.persistenceQueue {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		err := h.persistenceBreaker.Execute(func() error {
			return h.persistHistoricalCoordinate(ctx, job.Request, job.RecordedAt, job.Enriched)
		})
		cancel()

		if err != nil {
			job.Attempts++
			if job.Attempts <= 5 {
				time.Sleep(backoffFor(job.Attempts))
				h.enqueuePersistence(job)
			}
		}
	}
}

func (h *Handler) routingRetryWorker() {
	for job := range h.routingQueue {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		err := h.routingBreaker.Execute(func() error {
			return h.sendToRoutingService(ctx, job.Payload)
		})
		cancel()

		if err != nil {
			job.Attempts++
			if job.Attempts <= 5 {
				time.Sleep(backoffFor(job.Attempts))
				h.enqueueRouting(job)
			}
		}
	}
}

func (h *Handler) sendToRoutingService(ctx context.Context, payload map[string]interface{}) error {
	url := strings.TrimRight(h.config.RoutingServiceURL, "/") + "/api/v1/routing/events"

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.routingHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("routing status %d", resp.StatusCode)
	}

	return nil
}

func backoffFor(attempt int) time.Duration {
	if attempt <= 1 {
		return 250 * time.Millisecond
	}
	delay := time.Duration(attempt*attempt) * 250 * time.Millisecond
	if delay > 10*time.Second {
		return 10 * time.Second
	}
	return delay
}
