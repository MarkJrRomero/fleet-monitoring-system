package ingestion

import (
	"errors"
	"sync"
	"time"
)

type breakerState string

const (
	breakerClosed   breakerState = "closed"
	breakerOpen     breakerState = "open"
	breakerHalfOpen breakerState = "half-open"
)

var ErrCircuitOpen = errors.New("circuit breaker abierto")

type CircuitBreaker struct {
	mu               sync.Mutex
	state            breakerState
	failures         int
	failureThreshold int
	resetTimeout     time.Duration
	nextTryAt        time.Time
	halfOpenInFlight bool
}

func NewCircuitBreaker(failureThreshold int, resetTimeout time.Duration) *CircuitBreaker {
	if failureThreshold <= 0 {
		failureThreshold = 3
	}
	if resetTimeout <= 0 {
		resetTimeout = 30 * time.Second
	}

	return &CircuitBreaker{
		state:            breakerClosed,
		failureThreshold: failureThreshold,
		resetTimeout:     resetTimeout,
	}
}

func (cb *CircuitBreaker) Execute(fn func() error) error {
	if !cb.allow() {
		return ErrCircuitOpen
	}

	err := fn()
	if err != nil {
		cb.onFailure()
		return err
	}

	cb.onSuccess()
	return nil
}

func (cb *CircuitBreaker) allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()

	switch cb.state {
	case breakerClosed:
		return true
	case breakerOpen:
		if now.Before(cb.nextTryAt) {
			return false
		}
		cb.state = breakerHalfOpen
		cb.halfOpenInFlight = true
		return true
	case breakerHalfOpen:
		if cb.halfOpenInFlight {
			return false
		}
		cb.halfOpenInFlight = true
		return true
	default:
		return true
	}
}

func (cb *CircuitBreaker) onSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.state = breakerClosed
	cb.failures = 0
	cb.halfOpenInFlight = false
	cb.nextTryAt = time.Time{}
}

func (cb *CircuitBreaker) onFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if cb.state == breakerHalfOpen {
		cb.state = breakerOpen
		cb.nextTryAt = time.Now().Add(cb.resetTimeout)
		cb.halfOpenInFlight = false
		return
	}

	cb.failures++
	if cb.failures >= cb.failureThreshold {
		cb.state = breakerOpen
		cb.nextTryAt = time.Now().Add(cb.resetTimeout)
		cb.halfOpenInFlight = false
	}
}
