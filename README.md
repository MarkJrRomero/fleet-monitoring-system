# Fleet Monitoring System

Base del proyecto para monitoreo de flotas. Actualmente incluye el frontend inicial en React + TypeScript y un flujo de despliegue estandarizado con Makefile.

## Estado actual

- Frontend base en React + TypeScript
- Keycloak en Docker para flujo de autenticación
- Redis compartido para cache de microservicios
- PostgreSQL compartido para persistencia de microservicios
- ClickHouse como capa de analitica historica
- Apache Superset para dashboards y autoservicio BI
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
ClickHouse quedara disponible en `http://localhost:8123` (HTTP) y `localhost:9000` (native).
Superset quedara disponible en `http://localhost:8087`.
Servicio de ingesta quedara disponible en `http://localhost:8091`.
Servicio websocket quedara disponible en `ws://localhost:8093/ws/positions`.
Canal websocket de alertas quedara disponible en `ws://localhost:8093/ws/alerts`.
Servicio de vehiculos quedara disponible en `http://localhost:8094`.
Adminer (PostgreSQL UI) quedara disponible en `http://localhost:8088`.
Redis Commander (Redis UI) quedara disponible en `http://localhost:8089`.

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

## Apache Superset

Superset se integra como capa analitica separada del dashboard operacional React.

- URL: `http://localhost:8087`
- Usuario admin: valor de `SUPERSET_ADMIN_USERNAME` (default: `admin`)
- Password admin: valor de `SUPERSET_ADMIN_PASSWORD` (default: `admin`)
- Base de metadatos: PostgreSQL dedicado (`superset-db`)
- Conexion analitica registrada automaticamente hacia ClickHouse:

```text
clickhouse://default:clickhouse@clickhouse:8123/default
```

Implementacion incluida:

- Servicio `superset` en Docker Compose.
- Servicio `superset-db` para metadatos internos.
- Imagen custom con drivers `clickhouse-connect`, `clickhouse-sqlalchemy` y `psycopg2-binary`.
- Script de bootstrap `.docker/superset/superset_init.sh` que:
	- ejecuta migraciones,
	- crea el usuario administrador,
	- inicializa roles/permisos,
	- registra la conexion a ClickHouse.

Nota para mapas geoespaciales:

- Los charts `Deck.gl` requieren configurar `MAPBOX_API_KEY` en `.env` para renderizar el mapa base.
- Si `MAPBOX_API_KEY` esta vacio, los puntos o celdas pueden verse sobre un fondo blanco aunque la consulta funcione correctamente.

Para construir dashboards de sustentacion, consulta [docs/superset-dashboard-guide.md](docs/superset-dashboard-guide.md).

## Gestores visuales en Docker

### PostgreSQL (Adminer)

- URL: `http://localhost:8088`
- Sistema: `PostgreSQL`
- Servidor: `postgres`
- Usuario: valor de `POSTGRES_USER` (default: `fleet_user`)
- Password: valor de `POSTGRES_PASSWORD` (default: `fleet_password`)
- Base de datos: valor de `POSTGRES_DB` (default: `fleet_monitoring`)

### Redis (Redis Commander)

- URL: `http://localhost:8089`
- Usuario: valor de `REDIS_UI_USER` (default: `admin`)
- Password: valor de `REDIS_UI_PASSWORD` (default: `admin`)

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
	- `REDIS_POSITIONS_CHANNEL`, `REDIS_ALERTS_CHANNEL`
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
- Push asincrono en lote hacia ClickHouse (`telemetry_history`) para analitica de largo plazo
- Publicacion del evento en Redis channel (`gps:stream`) para consumo del websocket-service
- Si un vehiculo envia la misma coordenada por mas de 1 minuto, se publica alerta `Vehiculo Detenido` en `alerts:stream`

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
- ClickHouse complementa a PostgreSQL: no reemplaza persistencia transaccional, separa consultas analiticas del flujo operacional.
- Superset agrega una capa BI desacoplada para exploracion analitica, dashboards y reporting sin tocar el frontend operacional.
- El servicio de ingesta crea automaticamente su tabla historica en PostgreSQL al iniciar.
- El servicio de ingesta envia copia asincrona de coordenadas a ClickHouse por lotes usando variables `CLICKHOUSE_*`.
- El websocket-service se suscribe al canal Redis `gps:stream` y retransmite eventos a clientes WebSocket.
- A medida que se agreguen servicios en `services/` y `deployments/docker-compose.yml`, se levantaran automaticamente con el mismo flujo.
- Objetivo: mantener una interfaz unica de operacion para todo el sistema.

## Decisiones tecnicas: ClickHouse + PostgreSQL

Aunque el sistema puede operar solo con PostgreSQL, se integra ClickHouse para habilitar analitica de alto volumen en tiempo real:

- PostgreSQL: estado actual de vehiculos y operaciones transaccionales.
- ClickHouse: historico masivo y consultas OLAP de alto rendimiento.
- Superset: consumo analitico, dashboards ejecutivos y autoservicio sobre ClickHouse.

Esto evita que reportes historicos pesados afecten la latencia de ingesta GPS en tiempo real.

## Desafios y soluciones

- ClickHouse ofrece alto rendimiento analitico con menor complejidad operativa en entorno local.
- Si necesitas un entorno aun mas liviano, puedes mantener `CLICKHOUSE_ENABLED=false` y seguir con PostgreSQL como persistencia principal.

## Justificacion tecnica de Superset

- Escalabilidad: separar la visualizacion analitica en Superset del dashboard operacional React evita sobrecarga sobre el backend principal y protege la experiencia en tiempo real.
- Stack tecnologico: la arquitectura queda alineada con patrones enterprise donde Superset se usa como capa BI sobre motores analiticos columnares como Druid y ClickHouse.
- Valor de negocio: administradores y analistas pueden crear reportes personalizados sin depender de nuevos desarrollos en frontend o backend.