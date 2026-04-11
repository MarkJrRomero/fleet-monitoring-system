package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type ReverseLocation struct {
	Name        string `json:"name,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Road        string `json:"road,omitempty"`
	Neighbour   string `json:"neighbourhood,omitempty"`
	Suburb      string `json:"suburb,omitempty"`
	City        string `json:"city,omitempty"`
	State       string `json:"state,omitempty"`
	Country     string `json:"country,omitempty"`
	Postcode    string `json:"postcode,omitempty"`
}

type nominatimResponse struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Address     struct {
		Road         string `json:"road"`
		Neighbour    string `json:"neighbourhood"`
		Suburb       string `json:"suburb"`
		City         string `json:"city"`
		Town         string `json:"town"`
		Village      string `json:"village"`
		Municipality string `json:"municipality"`
		State        string `json:"state"`
		Country      string `json:"country"`
		Postcode     string `json:"postcode"`
	} `json:"address"`
}

type ReverseGeocoder struct {
	baseURL   string
	userAgent string
	client    *http.Client

	mu            sync.Mutex
	nextAllowedAt time.Time
	minInterval   time.Duration
}

func NewReverseGeocoder(baseURL, userAgent string) *ReverseGeocoder {
	trimmedURL := strings.TrimSpace(baseURL)
	if trimmedURL == "" {
		trimmedURL = "https://nominatim.openstreetmap.org/reverse"
	}
	trimmedAgent := strings.TrimSpace(userAgent)
	if trimmedAgent == "" {
		trimmedAgent = "fleet-monitoring-system/1.0"
	}

	return &ReverseGeocoder{
		baseURL:   trimmedURL,
		userAgent: trimmedAgent,
		client: &http.Client{
			Timeout: 6 * time.Second,
		},
		minInterval: time.Second,
	}
}

func (g *ReverseGeocoder) Reverse(ctx context.Context, lat, lng float64) (*ReverseLocation, error) {
	if err := g.waitTurn(ctx); err != nil {
		return nil, err
	}

	query := url.Values{}
	query.Set("lat", fmt.Sprintf("%.6f", lat))
	query.Set("lon", fmt.Sprintf("%.6f", lng))
	query.Set("format", "json")

	endpoint := g.baseURL
	if strings.Contains(endpoint, "?") {
		endpoint += "&" + query.Encode()
	} else {
		endpoint += "?" + query.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", g.userAgent)

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("nominatim status %d", resp.StatusCode)
	}

	var parsed nominatimResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	city := firstNonEmpty(parsed.Address.City, parsed.Address.Town, parsed.Address.Village, parsed.Address.Municipality)

	return &ReverseLocation{
		Name:        parsed.Name,
		DisplayName: parsed.DisplayName,
		Road:        parsed.Address.Road,
		Neighbour:   parsed.Address.Neighbour,
		Suburb:      parsed.Address.Suburb,
		City:        city,
		State:       parsed.Address.State,
		Country:     parsed.Address.Country,
		Postcode:    parsed.Address.Postcode,
	}, nil
}

func (g *ReverseGeocoder) waitTurn(ctx context.Context) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()
	if now.Before(g.nextAllowedAt) {
		return context.DeadlineExceeded
	}

	g.nextAllowedAt = now.Add(g.minInterval)
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
