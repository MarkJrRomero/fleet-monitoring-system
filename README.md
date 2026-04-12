# SMTF - Sistema de Monitoreo y Telemetría de Flotas

Sistema de monitoreo de flotas con frontend React, servicios en Go y capa analitica ClickHouse + Superset.

## Despliegue rapido (Make + Docker)

Desde la raiz del repositorio:

```bash
make env-init
make doctor
make up
```

Para apagar el stack:

```bash
make down
```

## URLs disponibles y credenciales de prueba

Luego de `make up`, estos endpoints quedan activos:

### Herramientas visuales

1. Frontend SMTF - Sistema de Monitoreo y Telemetría de Flotas
  - URL: http://localhost:5173
  - Usuario: admin_test
  - Password: admin123
  - Nota: login funcional contra Keycloak realm importado.

2. Keycloak Admin Console
  - URL: http://localhost:8080/admin
  - Usuario: admin
  - Password: admin
  - Nota: gestion de realm, clientes y usuarios.

3. Keycloak Realm Account
  - URL: http://localhost:8080/realms/fleet-monitoring/account
  - Usuario: admin_test
  - Password: admin123
  - Nota: portal de cuenta del usuario del realm.

4. Superset
  - URL: http://localhost:8087
  - Usuario: admin
  - Password: admin
  - Nota: dashboards y SQL Lab sobre ClickHouse.

5. Adminer (PostgreSQL UI)
  - URL: http://localhost:8088
  - Usuario: fleet_user
  - Password: fleet_password
  - Nota: servidor postgres, base fleet_monitoring.

6. Redis Commander
  - URL: http://localhost:8089
  - Usuario: admin
  - Password: admin
  - Nota: gestion visual de claves y canales Redis.

7. ClickHouse SQL Playground
  - URL: http://localhost:8123/play?user=default&password=clickhouse&database=default
  - Usuario: default
  - Password: clickhouse
  - Nota: consola SQL web para analitica.

### Servicios no visuales (APIs y streams)

1. ClickHouse HTTP API
  - URL: http://localhost:8123
  - Auth: default / clickhouse

2. Ingestion Service API
  - URL: http://localhost:8091
  - Auth: sin autenticacion en local

3. Vehicle Service API
  - URL: http://localhost:8094
  - Auth: sin autenticacion en local

4. WebSocket posiciones
  - URL: ws://localhost:8093/ws/positions
  - Auth: sin autenticacion en local

5. WebSocket alertas
  - URL: ws://localhost:8093/ws/alerts
  - Auth: sin autenticacion en local

## Comandos principales

| Comando | Descripcion |
|---|---|
| make up | Sube todo el stack local |
| make down | Baja todo el stack |
| make ps | Muestra estado de servicios |
| make logs SERVICE=all | Sigue logs de todos los servicios |
| make logs SERVICE=superset | Sigue logs de Superset |
| make restart SERVICE=clickhouse | Reinicia un servicio puntual |
| make build | Rebuild de imagenes |
| make pull | Pull de imagenes remotas |
| make env-init | Crea .env local desde .env.example |

## Guia operativa de Superset

- URL: http://localhost:8087
- Credenciales por defecto: admin / admin
- Conexion analitica cargada automaticamente:

```text
clickhouse://default:clickhouse@clickhouse:8123/default
```

Requisitos importantes para mapas/heatmaps:

- Definir MAPBOX_API_KEY en .env para ver mapa base en charts Deck.gl.
- Si aparece MEMORY_LIMIT_EXCEEDED en ClickHouse, aplicar filtros de tiempo y reducir cardinalidad (ver guia avanzada).

Guia de dashboards y SQL de sustentacion:

- docs/superset-dashboard-guide.md

## Estado actual del sistema

- Frontend base en React + TypeScript
- Keycloak en Docker para autenticacion y roles
- Redis compartido para cache/eventos
- PostgreSQL compartido para persistencia operacional
- ClickHouse para historico analitico
- Apache Superset para BI y autoservicio
- Ingestion Service (Go) con anti-duplicados
- WebSocket Service (Go) para realtime
- Vehicle Service (Go) para catalogo y simulacion backend

## Estructura del repositorio

```text
deployments/   # Orquestacion y despliegue
docs/          # Documentacion tecnica y guias
frontend/      # App web React + TypeScript
scripts/       # Scripts de soporte
services/      # Microservicios backend (Go)
Makefile       # Operacion estandar
```

## Requisitos

- Docker
- Docker Compose (docker compose o docker-compose)
- npm (Node.js)
- make

## Estrategia de variables de entorno

- Plantilla versionada: .env.example
- Archivo local: .env (no versionado)
- Docker Compose y Makefile consumen .env como fuente unica de verdad

Variables clave:

- Frontend: FRONTEND_PORT, FRONTEND_API_BASE_URL, FRONTEND_AUTH_URL, FRONTEND_AUTH_REALM, FRONTEND_AUTH_CLIENT_ID
- Keycloak: KEYCLOAK_PORT, KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_IMPORT_FILE
- ClickHouse: CLICKHOUSE_HTTP_PORT, CLICKHOUSE_NATIVE_PORT, CLICKHOUSE_USERNAME, CLICKHOUSE_PASSWORD, CLICKHOUSE_MEM_LIMIT
- Superset: SUPERSET_PORT, SUPERSET_ADMIN_USERNAME, SUPERSET_ADMIN_PASSWORD, SUPERSET_DB_NAME, MAPBOX_API_KEY
- Backends: INGESTION_SERVICE_PORT, VEHICLE_SERVICE_PORT, WEBSOCKET_SERVICE_PORT, REDIS_URL, POSTGRES_*

## APIs principales

### Ingestion API

Endpoint principal:

- POST /api/v1/ingestion/gps

Payload ejemplo:

```json
{
  "vehicle_id": "TRK-1001",
  "lat": -33.4489,
  "lng": -70.6693,
  "timestamp": "2026-04-11T18:25:43Z"
}
```

Comportamiento:

- Anti-duplicados por ventana temporal
- Cache reciente en Redis
- Persistencia operacional en PostgreSQL
- Replica analitica por lotes en ClickHouse (telemetry_history)
- Publicacion a canales Redis para consumo WebSocket

### Vehicle API

Base: http://localhost:8094/api/v1/vehicles

- GET /api/v1/vehicles
- POST /api/v1/vehicles/bulk
- POST /api/v1/vehicles
- GET /api/v1/vehicles/{vehicle_id}
- PATCH /api/v1/vehicles/{vehicle_id}

Control simulacion backend:

Base: http://localhost:8094/api/v1/simulation

- GET /api/v1/simulation/status
- POST /api/v1/simulation/start
- POST /api/v1/simulation/stop

## Notas de arquitectura

- make up es el entrypoint operacional recomendado.
- Keycloak se levanta con start-dev --import-realm y usa .docker/keycloak/realm-export.json.
- Superset corre desacoplado del dashboard React para carga analitica.
- ClickHouse y PostgreSQL cumplen roles distintos:
  - PostgreSQL: operaciones transaccionales y estado actual
  - ClickHouse: historico masivo y consultas OLAP

## Justificacion tecnica (seniority)

- Escalabilidad: separar BI (Superset) de operacion (React + APIs) evita sobrecarga en el backend principal.
- Stack tecnologico: alineacion con patrones enterprise donde Superset se monta sobre motores columnares (Druid/ClickHouse).
- Valor de negocio: analistas/admins pueden crear reportes sin dependencia del equipo de desarrollo.