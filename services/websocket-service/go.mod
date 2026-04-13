module fleet-monitoring-system/services/websocket-service

go 1.22

require fleet-monitoring-system/services/common-auth v0.0.0

replace fleet-monitoring-system/services/common-auth => ../common-auth

require (
	github.com/gorilla/websocket v1.5.3
	github.com/redis/go-redis/v9 v9.18.0
)

require (
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	go.uber.org/atomic v1.11.0 // indirect
)
