# Fleet Monitoring System

Base del proyecto para monitoreo de flotas. Actualmente incluye el frontend inicial en React + TypeScript y un flujo de despliegue estandarizado con Makefile.

## Estado actual

- Frontend base en React + TypeScript
- Keycloak en Docker para flujo de autenticación
- Redis compartido para cache de microservicios
- PostgreSQL compartido para persistencia de microservicios
- Microservicio de ingesta GPS (Go) con anti-duplicados y persistencia historica
- Microservicio WebSocket (Go) para streaming de posiciones en tiempo real
- Microservicio de vehiculos (Go) para catalogo y gestion de flota
- Modulo de simulacion en frontend para generar flota y enviar movimientos a ingesta
- Despliegue local con Docker Compose
- Operación unificada con Makefile (`make up`, `make down`, `make logs`, etc.)

## Estructura del repositorio

```text
deployments/   # Orquestación y despliegue
docs/          # Documentacion
frontend/      # Aplicacion web (React + TypeScript)
scripts/       # Scripts de soporte
services/      # Microservicios/backends (proximamente)
Makefile       # Comandos operativos
```

## Requisitos

- Docker
- Docker Compose (`docker compose` o `docker-compose`)
- npm (Node.js)
- make

## Quickstart (recomendado)

Desde la raiz del repositorio:

```bash
make env-init
make help
make doctor
make up
```

La app quedara disponible en `http://localhost:5173`.
Keycloak quedara disponible en `http://localhost:8080`.
Redis quedara disponible en `localhost:6379`.
PostgreSQL quedara disponible en `localhost:5432`.
Servicio de ingesta quedara disponible en `http://localhost:8091`.
Servicio websocket quedara disponible en `ws://localhost:8093/ws/positions`.
Servicio de vehiculos quedara disponible en `http://localhost:8094`.

Admin Console de Keycloak:
- URL: `http://localhost:8080/admin`
- Usuario: `admin` (o valor de `KEYCLOAK_ADMIN_USERNAME`)
- Password: `admin` (o valor de `KEYCLOAK_ADMIN_PASSWORD`)

Para apagar el stack:

```bash
make down
```

## Comandos principales

| Comando | Descripcion |
|---|---|
| `make up` | Sube todo el stack (frontend + keycloak + redis + postgres + ingestion-service) |
| `make down` | Baja todo el stack |
| `make ps` | Muestra estado de servicios |
| `make logs SERVICE=all` | Sigue logs de todos los servicios |
| `make logs SERVICE=keycloak` | Sigue logs de Keycloak |
| `make restart SERVICE=keycloak` | Reinicia Keycloak |
| `make build` | Rebuild de imagenes |
| `make pull` | Pull de imagenes remotas |
| `make env-init` | Crea `.env` local desde `.env.example` |

## Estrategia de variables de entorno (senior)

Se usa un contrato unico en la raiz del repo para alinear frontend, Keycloak y futuros microservicios:

- Plantilla versionada: `.env.example`
- Archivo local no versionado: `.env`
- Docker Compose y Makefile consumen `.env` como fuente de verdad

Esto evita drift entre servicios y simplifica CI/CD y despliegues por ambiente.

Variables clave actuales:

- Frontend:
	- `FRONTEND_PORT`
	- `FRONTEND_API_BASE_URL`
	- `FRONTEND_AUTH_URL`
	- `FRONTEND_AUTH_REALM`
	- `FRONTEND_AUTH_CLIENT_ID`
- Keycloak:
	- `KEYCLOAK_PORT`
	- `KEYCLOAK_ADMIN_USERNAME`
	- `KEYCLOAK_ADMIN_PASSWORD`
	- `KEYCLOAK_IMPORT_FILE`
- Microservicios (placeholders para siguientes iteraciones):
	- `API_PORT`, `API_BASE_URL`
	- `INGESTION_SERVICE_PORT`, `INGESTION_RECENT_TTL_SECONDS`, `INGESTION_DEDUPE_WINDOW_SECONDS`
	- `NOTIFICATION_SERVICE_PORT`
	- `REDIS_URL`, `REDIS_PORT`
	- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SSLMODE`

## API de Ingesta GPS

Endpoint principal:

- `POST /api/v1/ingestion/gps`

Payload esperado:

```json
{
	"vehicle_id": "TRK-1001",
	"lat": -33.4489,
	"lng": -70.6693,
	"timestamp": "2026-04-11T18:25:43Z"
}
```

Comportamiento:

- Anti-duplicados por ventana temporal configurable (misma coordenada en misma ventana => se ignora)
- Cache de coordenada reciente por vehiculo en Redis con TTL corto
- Persistencia historica en PostgreSQL (`gps_locations`)
- Publicacion del evento en Redis channel (`gps:stream`) para consumo del websocket-service

Ejemplo rapido:

```bash
curl -X POST http://localhost:8091/api/v1/ingestion/gps \
	-H "Content-Type: application/json" \
	-d '{
		"vehicle_id": "TRK-1001",
		"lat": -33.4489,
		"lng": -70.6693,
		"timestamp": "2026-04-11T18:25:43Z"
	}'
```

## Simulador de Flota (Frontend)

Ruta protegida:

- `/simulacion`

Funciones disponibles:

- Crear 100 vehiculos por cada click (acumulativo)
- Elegir cantidad de vehiculos a simular
- Iniciar/Detener simulacion de movimiento (persistente en backend)
- Activar/Desactivar conexion WebSocket
- Ver eventos en vivo enviados por `ws://localhost:8093/ws/positions`
- La simulacion sigue ejecutandose aunque cierres o cambies de pantalla

## API de Vehiculos

Endpoint base: `http://localhost:8094/api/v1/vehicles`

- `GET /api/v1/vehicles` -> lista vehiculos disponibles
- `POST /api/v1/vehicles/bulk` -> crea vehiculos de prueba en lote (default: 100)
- `POST /api/v1/vehicles` -> crea vehiculo individual
- `GET /api/v1/vehicles/{vehicle_id}` -> detalle por id
- `PATCH /api/v1/vehicles/{vehicle_id}` -> actualiza estado del vehiculo

### Control de simulacion persistente

Endpoint base: `http://localhost:8094/api/v1/simulation`

- `GET /api/v1/simulation/status` -> estado actual del simulador
- `POST /api/v1/simulation/start` -> inicia simulacion en backend
- `POST /api/v1/simulation/stop` -> detiene simulacion en backend

## Flujo frontend con Make

```bash
make frontend-install
make frontend-dev
make frontend-build
```

## Notas de arquitectura

- El comando operativo principal es `make up`.
- Keycloak corre con `start-dev --import-realm` y carga el realm desde `.docker/keycloak/realm-export.json`.
- Las credenciales admin de Keycloak y puertos se controlan en `.env`.
- Redis y PostgreSQL se despliegan como infraestructura compartida para todos los microservicios.
- El servicio de ingesta crea automaticamente su tabla historica en PostgreSQL al iniciar.
- El websocket-service se suscribe al canal Redis `gps:stream` y retransmite eventos a clientes WebSocket.
- A medida que se agreguen servicios en `services/` y `deployments/docker-compose.yml`, se levantaran automaticamente con el mismo flujo.
- Objetivo: mantener una interfaz unica de operacion para todo el sistema.