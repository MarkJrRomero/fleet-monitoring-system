package ingestion

import (
	"context"
	"log"
	"strings"
	"time"

	clickhouse "github.com/ClickHouse/clickhouse-go/v2"
)

type clickHouseEvent struct {
	VehicleID string
	Lat       float64
	Lng       float64
	Speed     float32
	Timestamp time.Time
	EventType string
}

type ClickHouseSink struct {
	enabled       bool
	conn          clickhouse.Conn
	database      string
	batchSize     int
	flushInterval time.Duration
	queue         chan clickHouseEvent
}

func NewClickHouseSink(cfg Config) *ClickHouseSink {
	if !cfg.ClickHouseEnabled {
		return nil
	}

	addr := strings.TrimSpace(cfg.ClickHouseAddr)
	if addr == "" {
		addr = "clickhouse:9000"
	}
	database := strings.TrimSpace(cfg.ClickHouseDatabase)
	if database == "" {
		database = "default"
	}
	username := strings.TrimSpace(cfg.ClickHouseUsername)
	if username == "" {
		username = "default"
	}

	batchSize := cfg.ClickHouseBatchSize
	if batchSize <= 0 {
		batchSize = 100
	}
	flushInterval := cfg.ClickHouseFlushInterval
	if flushInterval <= 0 {
		flushInterval = 3 * time.Second
	}

	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: database,
			Username: username,
			Password: cfg.ClickHousePassword,
		},
		DialTimeout: 3 * time.Second,
	})
	if err != nil {
		log.Printf("clickhouse init fallido: %v", err)
		return nil
	}

	sink := &ClickHouseSink{
		enabled:       true,
		conn:          conn,
		database:      database,
		batchSize:     batchSize,
		flushInterval: flushInterval,
		queue:         make(chan clickHouseEvent, maxInt(batchSize*5, 500)),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sink.ensureSchema(ctx); err != nil {
		log.Printf("clickhouse schema no disponible al iniciar: %v", err)
	}

	go sink.worker()
	return sink
}

func (h *Handler) pushClickHouseEvent(req gpsIngestRequest, recordedAt time.Time, enrichment positionEnrichment, alerts []map[string]interface{}) {
	if h.clickHouseSink == nil || !h.clickHouseSink.enabled {
		return
	}

	eventType := "HEARTBEAT"
	if len(alerts) > 0 {
		eventType = "ALERT"
	}

	event := clickHouseEvent{
		VehicleID: req.VehicleID,
		Lat:       req.Lat,
		Lng:       req.Lng,
		Speed:     float32(enrichment.SpeedKmh),
		Timestamp: recordedAt.UTC(),
		EventType: eventType,
	}

	h.clickHouseSink.enqueue(event)
}

func (s *ClickHouseSink) enqueue(event clickHouseEvent) {
	select {
	case s.queue <- event:
	default:
		log.Printf("clickhouse queue llena, descartando evento vehicle_id=%s", event.VehicleID)
	}
}

func (s *ClickHouseSink) worker() {
	ticker := time.NewTicker(s.flushInterval)
	defer ticker.Stop()

	batch := make([]clickHouseEvent, 0, s.batchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := s.insertBatch(ctx, batch); err != nil {
			log.Printf("clickhouse ingest fallido: %v", err)
		}
		cancel()
		batch = batch[:0]
	}

	for {
		select {
		case event := <-s.queue:
			batch = append(batch, event)
			if len(batch) >= s.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (s *ClickHouseSink) ensureSchema(ctx context.Context) error {
	if err := s.conn.Exec(ctx, "CREATE DATABASE IF NOT EXISTS "+s.database); err != nil {
		return err
	}

	return s.conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS telemetry_history (
			vehicle_id String,
			lat Float64,
			lng Float64,
			speed Float32,
			timestamp DateTime64(3, 'UTC'),
			event_type Enum8('HEARTBEAT' = 1, 'ALERT' = 2)
		)
		ENGINE = MergeTree()
		PARTITION BY toYYYYMM(timestamp)
		ORDER BY (vehicle_id, timestamp)
	`)
}

func (s *ClickHouseSink) insertBatch(ctx context.Context, events []clickHouseEvent) error {
	if err := s.ensureSchema(ctx); err != nil {
		return err
	}

	query := "INSERT INTO telemetry_history (vehicle_id, lat, lng, speed, timestamp, event_type) VALUES"
	batch, err := s.conn.PrepareBatch(ctx, query)
	if err != nil {
		return err
	}

	for _, event := range events {
		if err := batch.Append(
			event.VehicleID,
			event.Lat,
			event.Lng,
			event.Speed,
			event.Timestamp,
			event.EventType,
		); err != nil {
			return err
		}
	}

	return batch.Send()
}
