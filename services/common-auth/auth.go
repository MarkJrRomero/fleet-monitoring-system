package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

var (
	ErrMissingToken    = errors.New("missing bearer token")
	ErrInvalidToken    = errors.New("invalid bearer token")
	ErrAuthUnavailable = errors.New("keycloak unavailable")
)

type Config struct {
	ServiceName      string
	KeycloakBaseURL  string
	KeycloakHost     string
	Realm            string
	ClientID         string
	ClientSecret     string
	RequestTimeout   time.Duration
	TokenCacheSkew   time.Duration
	ExemptPaths      []string
	AllowedTokenKeys []string
}

type Middleware struct {
	serviceName      string
	introspectionURL string
	keycloakHost     string
	httpClient       *http.Client
	clientID         string
	clientSecret     string
	exemptPaths      map[string]struct{}
	allowedTokenKeys []string
}

type ServiceTokenProvider struct {
	tokenURL       string
	keycloakHost   string
	httpClient     *http.Client
	clientID       string
	clientSecret   string
	tokenCacheSkew time.Duration

	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

type Principal struct {
	Subject    string
	Username   string
	ClientID   string
	TokenType  string
	ExpiresAt  time.Time
	RealmRoles []string
}

type introspectionResponse struct {
	Active      bool   `json:"active"`
	Sub         string `json:"sub"`
	Username    string `json:"username"`
	ClientID    string `json:"client_id"`
	TokenType   string `json:"token_type"`
	Exp         int64  `json:"exp"`
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

type principalContextKey struct{}

func NewMiddleware(cfg Config) (*Middleware, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.KeycloakBaseURL), "/")
	realm := strings.TrimSpace(cfg.Realm)
	clientID := strings.TrimSpace(cfg.ClientID)
	clientSecret := strings.TrimSpace(cfg.ClientSecret)
	serviceName := strings.TrimSpace(cfg.ServiceName)

	if baseURL == "" || realm == "" || clientID == "" || clientSecret == "" || serviceName == "" {
		return nil, fmt.Errorf("keycloak auth config incompleta")
	}

	timeout := cfg.RequestTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	keys := cfg.AllowedTokenKeys
	if len(keys) == 0 {
		keys = []string{"access_token"}
	}

	exemptPaths := make(map[string]struct{}, len(cfg.ExemptPaths))
	for _, path := range cfg.ExemptPaths {
		trimmed := strings.TrimSpace(path)
		if trimmed != "" {
			exemptPaths[trimmed] = struct{}{}
		}
	}

	return &Middleware{
		serviceName:      serviceName,
		introspectionURL: fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token/introspect", baseURL, url.PathEscape(realm)),
		keycloakHost:     strings.TrimSpace(cfg.KeycloakHost),
		httpClient:       &http.Client{Timeout: timeout},
		clientID:         clientID,
		clientSecret:     clientSecret,
		exemptPaths:      exemptPaths,
		allowedTokenKeys: keys,
	}, nil
}

func NewServiceTokenProvider(cfg Config) (*ServiceTokenProvider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.KeycloakBaseURL), "/")
	realm := strings.TrimSpace(cfg.Realm)
	clientID := strings.TrimSpace(cfg.ClientID)
	clientSecret := strings.TrimSpace(cfg.ClientSecret)

	if baseURL == "" || realm == "" || clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("service token config incompleta")
	}

	timeout := cfg.RequestTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	cacheSkew := cfg.TokenCacheSkew
	if cacheSkew <= 0 {
		cacheSkew = 30 * time.Second
	}

	return &ServiceTokenProvider{
		tokenURL:       fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", baseURL, url.PathEscape(realm)),
		keycloakHost:   strings.TrimSpace(cfg.KeycloakHost),
		httpClient:     &http.Client{Timeout: timeout},
		clientID:       clientID,
		clientSecret:   clientSecret,
		tokenCacheSkew: cacheSkew,
	}, nil
}

func (m *Middleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || m.isExemptPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		token, err := m.extractToken(r)
		if err != nil {
			m.writeError(w, r, http.StatusUnauthorized, "AUTH_TOKEN_MISSING", "Token de acceso requerido")
			return
		}

		principal, err := m.introspect(r.Context(), token)
		if err != nil {
			switch {
			case errors.Is(err, ErrInvalidToken):
				m.writeError(w, r, http.StatusUnauthorized, "AUTH_TOKEN_INVALID", "Token invalido o expirado")
			default:
				m.writeError(w, r, http.StatusBadGateway, "AUTH_UPSTREAM_UNAVAILABLE", "No fue posible validar el token contra Keycloak")
			}
			return
		}

		ctx := context.WithValue(r.Context(), principalContextKey{}, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(Principal)
	return principal, ok
}

func (p *ServiceTokenProvider) AccessToken(ctx context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.accessToken != "" && time.Until(p.expiresAt) > p.tokenCacheSkew {
		return p.accessToken, nil
	}

	values := url.Values{}
	values.Set("grant_type", "client_credentials")
	values.Set("client_id", p.clientID)
	values.Set("client_secret", p.clientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.tokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return "", err
	}
	if p.keycloakHost != "" {
		req.Host = p.keycloakHost
		req.Header.Set("Host", p.keycloakHost)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrAuthUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("%w: token endpoint respondio %d", ErrAuthUnavailable, resp.StatusCode)
	}

	var payload tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("%w: respuesta invalida", ErrAuthUnavailable)
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", fmt.Errorf("%w: token vacio", ErrAuthUnavailable)
	}

	p.accessToken = payload.AccessToken
	p.expiresAt = time.Now().Add(time.Duration(payload.ExpiresIn) * time.Second)
	return p.accessToken, nil
}

func (m *Middleware) introspect(ctx context.Context, token string) (Principal, error) {
	values := url.Values{}
	values.Set("token", token)
	values.Set("client_id", m.clientID)
	values.Set("client_secret", m.clientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.introspectionURL, strings.NewReader(values.Encode()))
	if err != nil {
		return Principal{}, err
	}
	if m.keycloakHost != "" {
		req.Host = m.keycloakHost
		req.Header.Set("Host", m.keycloakHost)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return Principal{}, fmt.Errorf("%w: %v", ErrAuthUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Principal{}, fmt.Errorf("%w: introspection respondio %d", ErrAuthUnavailable, resp.StatusCode)
	}

	var payload introspectionResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return Principal{}, fmt.Errorf("%w: respuesta invalida", ErrAuthUnavailable)
	}

	if !payload.Active {
		return Principal{}, ErrInvalidToken
	}

	principal := Principal{
		Subject:    payload.Sub,
		Username:   payload.Username,
		ClientID:   payload.ClientID,
		TokenType:  payload.TokenType,
		RealmRoles: append([]string(nil), payload.RealmAccess.Roles...),
	}
	if payload.Exp > 0 {
		principal.ExpiresAt = time.Unix(payload.Exp, 0).UTC()
		if time.Now().After(principal.ExpiresAt) {
			return Principal{}, ErrInvalidToken
		}
	}

	return principal, nil
}

func (m *Middleware) extractToken(r *http.Request) (string, error) {
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
		token := strings.TrimSpace(authorization[7:])
		if token != "" {
			return token, nil
		}
	}

	query := r.URL.Query()
	for _, key := range m.allowedTokenKeys {
		token := strings.TrimSpace(query.Get(key))
		if token != "" {
			return token, nil
		}
	}

	return "", ErrMissingToken
}

func (m *Middleware) isExemptPath(path string) bool {
	_, ok := m.exemptPaths[strings.TrimSpace(path)]
	return ok
}

func (m *Middleware) writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"code":       code,
			"message":    message,
			"status":     status,
			"service":    m.serviceName,
			"request_id": strings.TrimSpace(r.Header.Get("X-Request-Id")),
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		},
	})
}
