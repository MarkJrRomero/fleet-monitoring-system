# SMTF — Sistema de Monitoreo y Telemetría de Flotas

Sistema distribuido de monitoreo GPS de flotas en tiempo real: frontend React, microservicios Go, capa analítica ClickHouse + Superset y prototipo móvil React Native.

---

## Tabla de contenidos

1. [Inicio rápido](#inicio-rápido)
2. [Capturas de pantalla](#capturas-de-pantalla)
3. [Servicios y accesos](#servicios-y-accesos)
4. [Diagrama de arquitectura](#diagrama-de-arquitectura)
5. [Estructura del repositorio](#estructura-del-repositorio)
6. [Prototipo móvil para conductores](#prototipo-móvil-para-conductores)
7. [APIs principales](#apis-principales)
8. [Tolerancia a fallos y resiliencia](#tolerancia-a-fallos-y-resiliencia)
9. [Transacciones y consistencia](#transacciones-y-consistencia)
10. [Variables de entorno](#variables-de-entorno)
11. [Pruebas unitarias](#pruebas-unitarias)
12. [Justificación técnica](#justificación-técnica)
13. [Desafíos y soluciones](#desafíos-y-soluciones)
14. [Reporte de IA](#reporte-de-ia)

---

## Inicio rápido

### Requisitos previos

- Docker
- Docker Compose (`docker compose` o `docker-compose`)
- `make`
- `npm` / Node.js (solo para la app móvil)

### Levantar el stack completo

```bash
# 1. Inicializar variables de entorno
make env-init

# 2. Verificar dependencias del sistema
make doctor

# 3. Levantar todos los servicios
make up
```

El stack incluye: Frontend, Keycloak, Vehicle Service, Ingestion Service, WebSocket Service, Redis, PostgreSQL, ClickHouse, Superset y Nginx gateway.

### Apagar el stack

```bash
# Solo bajar (conserva volúmenes y datos)
make down

# Bajar y limpiar todo (volúmenes, redes, imágenes locales)
make down DOWN_ARGS="--volumes --remove-orphans --rmi local"
```

### Accesos rápidos luego de `make up`

| Servicio | URL | Usuario | Contraseña |
|---|---|---|---|
| Frontend SMTF | http://localhost:5173 | admin_test | admin123 |
| Keycloak Admin | http://localhost:8080/admin | admin | admin |
| Apache Superset | http://localhost:8087 | admin | admin |
| Adminer (PostgreSQL) | http://localhost:8088 | fleet_user | fleet_password |
| Redis Commander | http://localhost:8089 | admin | admin |
| Documentación API | http://localhost:5173/documentacion | — | — |

### Comandos principales

| Comando | Descripción |
|---|---|
| `make up` | Sube todo el stack local |
| `make down` | Baja todo el stack |
| `make ps` | Muestra estado de servicios |
| `make logs SERVICE=all` | Sigue logs de todos los servicios |
| `make logs SERVICE=vehicle-service` | Logs de un servicio puntual |
| `make restart SERVICE=clickhouse` | Reinicia un servicio |
| `make build` | Rebuild de imágenes |
| `make env-init` | Crea `.env` local desde `.env.example` |

---

## Capturas de pantalla

### Frontend Web — Panel de control

**Login**

![Login web](screenshots/web/login.png)

**Dashboard — Mapa en tiempo real**

![Mapa tiempo real](screenshots/web/mapa.png)

**Gestión de vehículos**

![Vehículos](screenshots/web/vehiculos.png)

**Simulador de telemetría**

![Simulador](screenshots/web/simulador.png)

### Documentación API (Scalar)

El panel web incluye una referencia unificada con Scalar en `/documentacion`. Consolida las especificaciones OpenAPI de Vehicle Service, Ingestion Service y WebSocket Service en una sola experiencia navegable.

![Documentación API](screenshots/services/docs.png)

### Keycloak — Gestión de identidad

![Keycloak](screenshots/keycloak/keycloak.png)

### Apache Superset — Analítica

![Superset](screenshots/superset/login.png)

### Adminer — PostgreSQL

![Adminer](screenshots/db/adminer.png)

### Redis Commander

![Redis Commander](screenshots/redis/redis.png)

### App Móvil para conductores

| Login | Panel conductor | Admin |
|---|---|---|
| ![Login app](screenshots/app/login.png) | ![Driver](screenshots/app/driver.png) | ![Admin](screenshots/app/admin.png) |

---

## Servicios y accesos

### Servicios principales (con interfaz)

**1. Frontend SMTF**
- URL: http://localhost:5173
- Usuario: `admin_test` / Password: `admin123`
- Nota: login funcional contra Keycloak realm importado.

**2. Keycloak Admin Console**
- URL: http://localhost:8080/admin
- Usuario: `admin` / Password: `admin`
- Nota: gestión de realm, clientes y usuarios.

**3. Apache Superset**
- URL: http://localhost:8087
- Usuario: `admin` / Password: `admin`
- Nota: dashboards y SQL Lab sobre ClickHouse.
- Conexión analítica precargada: `clickhouse://default:clickhouse@clickhouse:8123/default`
- Guía detallada: [docs/superset-dashboard-guide.md](docs/superset-dashboard-guide.md)

**4. Adminer (PostgreSQL UI)**
- URL: http://localhost:8088
- Usuario: `fleet_user` / Password: `fleet_password`
- Nota: servidor `postgres`, base `fleet_monitoring`.

**5. Redis Commander**
- URL: http://localhost:8089
- Usuario: `admin` / Password: `admin`
- Nota: gestión visual de claves y canales Redis.

**6. Documentación API (Scalar)**
- URL: http://localhost:5173/documentacion
- Nota: referencia unificada OpenAPI — Vehicle Service, Ingestion Service y WebSocket Service.

### Servicios adicionales

| Servicio | URL | Credenciales |
|---|---|---|
| ClickHouse SQL Playground | http://localhost:8123/play?user=default&password=clickhouse&database=default | default / clickhouse |
| ClickHouse HTTP API | http://localhost:8123 | default / clickhouse |
| Nginx Gateway | http://localhost:8082 | — |
| Ingestion Service (vía gateway) | http://localhost:8082/ingestion | sin auth en local |
| Vehicle Service (vía gateway) | http://localhost:8082/vehicle | sin auth en local |
| WebSocket posiciones | ws://localhost:8082/ws/positions | sin auth en local |
| WebSocket alertas | ws://localhost:8082/ws/alerts | sin auth en local |

**Gateway Nginx — rutas:**

```
/vehicle/*     → Vehicle Service  (:8094)
/ingestion/*   → Ingestion Service (:8093)
/ws/*          → WebSocket Service (:8095)
/auth/*        → Keycloak (:8080)
```

---

## Diagrama de arquitectura

```mermaid
graph TB
    subgraph Clientes
        FE["Frontend Web\nReact + Vite\n:5173"]
        APP["App Móvil\nReact Native + Expo"]
    end

    subgraph Gateway
        GW["Nginx Gateway\n:8082"]
        AUTH["Keycloak\n:8080"]
    end

    subgraph "Microservicios (Go)"
        VS["Vehicle Service\n:8094\nCatálogo + Simulación"]
        IS["Ingestion Service\n:8093\nGPS + Anti-dup + CB"]
        WSS["WebSocket Service\n:8095\nRealtime Hub"]
    end

    subgraph Persistencia
        PG["PostgreSQL\n:5432\nEstado operacional"]
        RD["Redis\n:6379\nCache + Pub/Sub"]
        CH["ClickHouse\n:8123\nHistórico analítico"]
    end

    subgraph Analítica
        SSP["Apache Superset\n:8087"]
    end

    FE -->|HTTP + WS| GW
    APP -->|HTTP + WS| GW
    FE -->|OIDC| AUTH
    APP -->|OIDC| AUTH
    GW --> VS
    GW --> IS
    GW --> WSS

    VS --> PG
    VS --> RD
    IS --> PG
    IS --> RD
    IS -->|batch async| CH
    RD -->|pub/sub| WSS
    SSP --> CH
```

**Decisiones de diseño clave:**

- **Nginx gateway** centraliza routing, CORS y terminación TLS, desacoplando clientes de puertos internos.
- **Redis** cumple dos roles: caché de telemetría reciente (TTL corto) y canal pub/sub para el WebSocket Service.
- **PostgreSQL vs ClickHouse**: operaciones transaccionales y estado actual en Postgres; histórico masivo y consultas OLAP en ClickHouse.
- **Superset desacoplado**: los analistas crean reportes sin dependencia del equipo de desarrollo.

---

## Estructura del repositorio

```text
deployments/        # Docker Compose y configuración de servicios
docs/               # Documentación técnica y guías operativas
frontend/           # App web React + TypeScript (Vite)
app-movil/          # Prototipo móvil React Native (Expo)
services/
  ingestion-service/  # GPS ingest, anti-dup, circuit breaker (Go)
  vehicle-service/    # Catálogo de vehículos + simulación (Go)
  websocket-service/  # Hub WebSocket + pub/sub Redis (Go)
screenshots/        # Capturas organizadas por servicio
Makefile            # Operación estándar del proyecto
```

---

## Prototipo móvil para conductores

Cliente móvil funcional en `app-movil/` construido con **React Native + Expo**, conectado al mismo backend del sistema.

### Funcionalidades implementadas

- Login real contra Keycloak (mismo realm y client del frontend web).
- Pantalla principal de telemetría:
  - Estado de conexión (red + WebSocket + modo túnel — simulación de pérdida de 10 minutos).
  - Botón de pánico flotante (envía evento al endpoint de ingestion con `panic_button=true`).
  - Viaje activo con temporizador y distancia acumulada aproximada.
- Historial de alertas locales persistido en AsyncStorage del dispositivo.
- Suscripción a WebSocket de posiciones y alertas para actualización en tiempo real.
- Página de simulador de telemetría (inicio/parada y modo túnel).
- Página de perfil con datos del usuario y cierre de sesión.

### Ejecutar app móvil

```bash
cd app-movil
npm install
npm run start
```

O usando `make`:

```bash
make mobile-install   # instala dependencias
make mobile-start     # abre el servidor Expo (QR para iOS/Android)
```

Variables de entorno opcionales:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8082
EXPO_PUBLIC_WS_BASE_URL=ws://localhost:8082
EXPO_PUBLIC_AUTH_CLIENT_ID=fleet-web-client
```

Para dispositivo físico en red local (reemplazar con la IP LAN de tu equipo):

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8082
EXPO_PUBLIC_WS_BASE_URL=ws://192.168.1.50:8082
```

> **Nota Android emulator:** usar `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8082`

La app consume el gateway Nginx, no los microservicios directamente.

### Propuesta arquitectónica móvil — producción

#### Offline First (túnel, 10 minutos sin conectividad)

**1. Cola local duradera de eventos**
- Persistir eventos de telemetría y acciones críticas (pánico) en SQLite/Realm con estados: `pending`, `in_flight`, `acked`, `failed`.
- Cada evento incluye `event_id` UUID para idempotencia end-to-end.

**2. Sincronización incremental y resiliente**
- Al recuperar conectividad, enviar en lotes pequeños (50–200 eventos) con backoff exponencial y jitter.
- Limitar tasa de subida por ventana para evitar picos contra el ingestion-service.
- Priorizar eventos críticos (pánico, choque, geofence breach) sobre telemetría regular.

**3. Control de consistencia sin saturar el servidor**
- API de ingesta idempotente por `event_id` para deduplicar server-side.
- ACK por rango/offset para evitar reenvíos masivos.
- Compactación local: resumir puntos de baja relevancia manteniendo puntos clave (inicio, paradas, cambios de rumbo).

**4. Observabilidad operativa**
- Métricas de cola local: tamaño, antigüedad máxima, throughput de sync y ratio de reintentos.
- Alertas cuando el backlog supera umbrales (> N eventos o > X minutos sin drenar).

#### Batería (GPS cada segundo drena energía)

**1. Muestreo adaptativo por contexto**
- Frecuencia alta solo cuando hay viaje activo y velocidad/cambio de rumbo significativos.
- Reducir frecuencia cuando el vehículo está detenido o en tráfico lento.

**2. APIs nativas eficientes**
- iOS: Significant-Change Location Service + deferred updates.
- Android: Fused Location Provider con prioridad balanceada y batching.

**3. Estrategia basada en eventos, no polling continuo**
- Disparar lecturas por distancia recorrida, aceleración brusca o geocercas, no solo por intervalo fijo.

**4. Envío por lotes y ventanas**
- Agrupar puntos y transmitir cada ventana corta (10–20 s) para eventos no críticos.
- Eventos críticos: envío inmediato con prioridad alta.

**5. Gobernanza por batería/temperatura**
- Con batería baja o thermal throttling: bajar precisión y frecuencia automáticamente.
- Políticas configurables remotamente para tuning sin publicar nueva versión de la app.

---

## APIs principales

### Ingestion API

**Endpoint GPS:**

```
POST http://localhost:8082/ingestion/api/v1/ingestion/gps
```

```json
{
  "vehicle_id": "TRK-1001",
  "lat": -33.4489,
  "lng": -70.6693,
  "timestamp": "2026-04-11T18:25:43Z"
}
```

Comportamiento interno:
- Anti-duplicados por ventana temporal (clave Redis `gps:dedupe:{vehicle_id}:{hash}` con TTL).
- Caché reciente en Redis (`gps:last:{vehicle_id}`).
- Persistencia operacional en PostgreSQL.
- Réplica analítica asíncrona en ClickHouse (`telemetry_history`).
- Publicación a canal Redis para consumo por WebSocket Service.
- Detección de alerta "Vehículo Detenido" si la misma coordenada persiste > 1 minuto.

### Vehicle API

```
Base: http://localhost:8082/vehicle/api/v1/vehicles

GET    /api/v1/vehicles
POST   /api/v1/vehicles
POST   /api/v1/vehicles/bulk
GET    /api/v1/vehicles/{vehicle_id}
PATCH  /api/v1/vehicles/{vehicle_id}
DELETE /api/v1/vehicles/{vehicle_id}?scope=vehicle_only|with_history
```

**Control de simulación backend:**

```
GET  /api/v1/simulation/status
POST /api/v1/simulation/start
POST /api/v1/simulation/stop
```

La simulación genera al menos 5 vehículos enviando coordenadas cada 2–5 segundos, con inyección de caos: 10 % de peticiones duplicadas y 5 % con formato erróneo para validar el manejo de errores.

### WebSocket Service

```
ws://localhost:8082/ws/positions   # Stream de posiciones GPS en tiempo real
ws://localhost:8082/ws/alerts      # Stream de alertas generadas
```

---

## Tolerancia a fallos y resiliencia

### Circuit Breaker (Ingestion Service)

El Ingestion Service implementa el patrón **Circuit Breaker** para proteger la persistencia:

- **Estado Closed (normal):** las solicitudes fluyen directamente a PostgreSQL/ClickHouse.
- **Estado Open (falla detectada):** después de N fallos consecutivos, el circuito abre y las peticiones se responden con error controlado (o se encolan en memoria) sin propagar la cascada de fallos al cliente.
- **Estado Half-Open (recuperación):** tras un timeout, se permite una petición de prueba; si tiene éxito, el circuito vuelve a Closed.

```text
services/ingestion-service/internal/ingestion/circuit_breaker.go
services/ingestion-service/internal/ingestion/resilience.go
```

### Anti-duplicados

- Cada evento GPS genera un hash `{vehicle_id}:{lat}:{lng}:{timestamp_bucket}`.
- Se consulta Redis con este hash antes de procesar; si ya existe, el evento se descarta silenciosamente.
- El TTL de la clave de deduplicación define la "ventana de tiempo" configurable.

### Validación de datos (Specification pattern)

- El handler del Ingestion Service valida formato, rangos de coordenadas y presencia de campos obligatorios antes de cualquier operación de persistencia.
- El 5 % de peticiones con formato erróneo del simulador de caos se rechaza con `400 Bad Request` y log estructurado.

---

## Transacciones y consistencia

### Eliminación de vehículos — Saga simplificada

Cuando se elimina un vehículo, el sistema debe garantizar consistencia entre PostgreSQL y Redis. Se implementó una estrategia de **consistencia eventual con cola de invalidación** (patrón Saga por compensación/reintentos):

```
DELETE /api/v1/vehicles/{vehicle_id}?scope=vehicle_only|with_history
```

**Flujo:**

1. `vehicle-service` abre transacción en PostgreSQL.
2. Dentro de la transacción:
   - Elimina el vehículo de `vehicles`.
   - Si `scope=with_history`: elimina historial de `gps_locations`.
   - Inserta un job `pending` en `vehicle_cache_invalidation_jobs`.
3. `COMMIT`.
4. Intento inmediato de invalidación de caché en Redis.
5. Worker en background reprocesa jobs `pending` con backoff hasta que Redis confirme la invalidación.

**Claves Redis invalidadas por vehículo:**

```
gps:recent:{vehicle_id}
gps:last:{vehicle_id}
alert:overspeed:{vehicle_id}
alert:panic:{vehicle_id}
gps:dedupe:{vehicle_id}:*      (scan + del)
alert:stopped:{vehicle_id}:*   (scan + del)
```

Documentación detallada: [docs/vehicle-deletion-consistency.md](docs/vehicle-deletion-consistency.md)

---

## Variables de entorno

- Plantilla versionada: `.env.example`
- Archivo local: `.env` (no versionado)
- Docker Compose y Makefile consumen `.env` como fuente única de verdad.

Variables clave por componente:

| Componente | Variables |
|---|---|
| Frontend | `FRONTEND_PORT`, `FRONTEND_API_BASE_URL`, `FRONTEND_AUTH_URL`, `FRONTEND_AUTH_REALM`, `FRONTEND_AUTH_CLIENT_ID` |
| Keycloak | `KEYCLOAK_PORT`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_IMPORT_FILE` |
| PostgreSQL | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Redis | `REDIS_URL`, `REDIS_PORT` |
| ClickHouse | `CLICKHOUSE_HTTP_PORT`, `CLICKHOUSE_NATIVE_PORT`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_MEM_LIMIT` |
| Superset | `SUPERSET_PORT`, `SUPERSET_ADMIN_USERNAME`, `SUPERSET_ADMIN_PASSWORD`, `MAPBOX_API_KEY` |
| Backends | `INGESTION_SERVICE_PORT`, `VEHICLE_SERVICE_PORT`, `WEBSOCKET_SERVICE_PORT` |

---

## Pruebas unitarias

Las pruebas cubren las reglas de negocio más críticas del sistema:

**Ingestion Service (Go):**
- Lógica de anti-duplicados (hash + TTL).
- Validación de payload GPS (coordenadas fuera de rango, campos faltantes).
- Comportamiento del Circuit Breaker en estados Closed / Open / Half-Open.
- Detección de "Vehículo Detenido" (misma coordenada > 1 minuto).

**Vehicle Service (Go):**
- Flujo de eliminación con transacción + Saga de invalidación de caché.
- Creación y actualización de vehículos con validaciones de negocio.

Ejecutar tests:

```bash
cd services/ingestion-service && go test ./...
cd services/vehicle-service   && go test ./...
```

---

## Justificación técnica

| Decisión | Justificación |
|---|---|
| **Go para microservicios** | Alto throughput con bajo footprint de memoria; concurrencia nativa con goroutines ideal para ingestión GPS masiva. |
| **React + Vite (no Next.js)** | SPA pura con HMR rápido; sin necesidad de SSR para un dashboard en tiempo real controlado por WebSockets. |
| **PostgreSQL + ClickHouse** | Postgres para operaciones transaccionales y estado actual; ClickHouse para histórico masivo y consultas OLAP analíticas. |
| **Redis como broker** | Latencia sub-milisegundo para caché de telemetría reciente y como canal pub/sub para el WebSocket Service. |
| **Nginx gateway** | Punto único de entrada: routing, CORS y terminación TLS sin exponer puertos internos. |
| **Keycloak** | IAM enterprise-grade con OIDC/JWT; el mismo realm sirve al frontend web y a la app móvil. |
| **Apache Superset desacoplado** | Analistas crean dashboards sobre ClickHouse sin dependencia del equipo de desarrollo ni del frontend operacional. |
| **Circuit Breaker en Ingestion Service** | Garantiza que una falla temporal en persistencia no derribe el servicio de ingestión bajo carga alta. |
| **Saga simplificada para eliminación** | Consistencia eventual garantizada sin Two-Phase Commit distribuido; la cola de invalidación converge incluso si Redis falla temporalmente. |
| **React Native + Expo para móvil** | Código compartido iOS/Android; acceso a APIs nativas con Expo SDK; tiempo de desarrollo reducido comparado con desarrollo nativo separado. |

---

## Desafíos y soluciones

### 1. Consistencia cache + BD al eliminar vehículos

**Problema:** eliminar un vehículo requería borrar datos en PostgreSQL y en Redis de forma atómica, pero no existe una transacción distribuida nativa entre ambos sistemas.

**Solución aplicada:** tabla `vehicle_cache_invalidation_jobs` dentro de la misma transacción Postgres + worker de reintentos con backoff exponencial. La eliminación en persistencia es atómica; Redis converge a estado consistente aunque falle temporalmente.

**Qué haría diferente con más tiempo/recursos:** implementar un outbox pattern completo con un message broker (Kafka o NATS) para mayor observabilidad y replay ante fallos.

---

### 2. Geocodificación inversa como dependencia externa

**Problema:** el Ingestion Service consulta una API de geocodificación para enriquecer los eventos GPS. Si la API externa falla, podría bloquear la ingestión.

**Solución aplicada:** la geocodificación es no bloqueante: si falla, el evento se persiste sin información de dirección y se registra el error. El Circuit Breaker también protege esta dependencia.

**Qué haría diferente:** cache agresivo de geocoding por celda de grilla (H3/S2) para reducir llamadas externas y latencia.

---

### 3. Fan-out de WebSocket a múltiples clientes

**Problema:** el WebSocket Service necesita distribuir actualizaciones a N clientes simultáneos con mínima latencia.

**Solución aplicada:** hub en memoria con canales Go; Redis pub/sub como fuente. Para un nodo único funciona bien.

**Qué haría diferente en producción:** con múltiples instancias del WebSocket Service, usar Redis Streams o un broker externo (Kafka) para que el fan-out funcione entre nodos y soporte horizontal scaling.

---

### 4. Circular imports en la app móvil React Native

**Problema:** importar `RootStackParamList` desde `RootNavigator.tsx` en cada pantalla causaba errores de resolución de módulo ("module not found") en el bundler de Expo.

**Solución aplicada:** cada pantalla define su propio tipo local `DriverStackParamList` sólo con las rutas que necesita, eliminando la dependencia circular.

---

### 5. Stack analítico vs. operacional

**Problema:** Superset ejecutando queries OLAP sobre la misma base transaccional generaría contención y degrado de performance operacional.

**Solución aplicada:** pipeline asíncrono de PostgreSQL → ClickHouse (réplica analítica por lotes desde el Ingestion Service). Superset sólo consulta ClickHouse, never Postgres.

---

### 6. Inestabilidad visual en el mapa Leaflet (pins, pan/zoom y tiles)

**Problema:** al seleccionar vehículos en el dashboard aparecían varios síntomas: jitter de pines al cambiar de selección, desfase visual entre mapa y marcadores durante pan/zoom, y zonas grises de tiles en movimientos encadenados.

**Solución aplicada (implementada con apoyo de Gemini 3.1 + Copilot):**

- Migración de pines SVG (`CircleMarker`) a `Marker` con `L.divIcon` HTML/CSS para estabilizar render y clustering.
- Separación del vehículo seleccionado como overlay para evitar reorder masivo dentro de `MarkerClusterGroup`.
- Bloqueo de propagación del click del marcador (`stopPropagation`) para evitar colisiones de interacción con el mapa base.
- Validación anti-vuelo nulo en enfoque (`distance < 5` y zoom alto) para no disparar animaciones innecesarias.
- Uso de `map.invalidateSize()` alrededor de la navegación (`flyTo`/`panTo`) para forzar recálculo y prevenir tiles incompletos.
- Control dinámico de transiciones: durante `movestart/zoomstart` se desactiva transición de markers y se reactiva en `moveend/zoomend`, eliminando el efecto de marcadores arrastrados.

**Resultado:** interacción estable en selección de vehículos, movimiento suave en telemetría en tiempo real, y reducción significativa del artefacto de pantalla gris en flujos de navegación del dashboard.

---

## Reporte de IA

### Herramientas utilizadas

- **GitHub Copilot** (VS Code) — asistente primario durante todo el desarrollo.
- **Claude Sonnet 4.6** (vía GitHub Copilot Chat) — análisis arquitectónico, refactorizaciones complejas, documentación.
- **Claude Opus 4.6** — revisión de patrones de diseño y estrategias de consistencia distribuida.
- **Gemini 3.1** — soporte en diagnóstico del mapa Leaflet (tiles grises, bubbling y jitter de marcadores) y generación del logo principal de la interfaz.

### Tareas donde se apoyó en IA

| Tarea | Herramienta |
|---|---|
| Generación de boilerplate de microservicios Go (handlers, structs, routing) | Copilot |
| Implementación del patrón Circuit Breaker (`circuit_breaker.go`) | Copilot + Claude Sonnet |
| Diseño e implementación de la Saga de invalidación de caché | Claude Sonnet |
| Configuración de Docker Compose multi-servicio con dependencias y health checks | Copilot |
| Estructuración del README y documentación técnica | Claude Sonnet |
| Análisis de integración ClickHouse ↔ Superset | Claude Sonnet |
| Creación del prototipo de app móvil (navegación, screens, WebSocket hooks) | Copilot + Claude Sonnet |
| Generación de datos falsos para el simulador de caos | Copilot |
| Estrategia offline-first y optimización de batería | Claude Sonnet |
| Diagnóstico y hardening del mapa Leaflet (overlay seleccionado, invalidateSize, control de transición en pan/zoom) | Copilot + Gemini 3.1 |

### Hallucinations / errores detectados y corrección Senior

**1. Circuit Breaker incorrecto en Go:**
La IA generó inicialmente un Circuit Breaker usando `sync.Mutex` en un patrón que podía producir deadlocks bajo concurrencia alta (lock dentro de goroutine llamada dentro del mismo lock). Se corrigió revisando el código manualmente, separando la lectura del estado del breaker (solo lectura con `RLock`) de la transición de estado (escritura con `Lock`), y añadiendo un timeout en el estado Half-Open.

**2. Consultas ClickHouse con sintaxis MySQL:**
Al pedir consultas analíticas, la IA generó `GROUP_CONCAT()` y `NOW()` con sintaxis MySQL en lugar de las equivalentes de ClickHouse (`groupArray()`, `now()`). Se corrigieron consultando la documentación oficial de ClickHouse.

**3. Importación circular en React Native:**
La IA sugirió importar `RootStackParamList` directamente desde `RootNavigator.tsx` en cada screen. Aunque es un patrón común, en este proyecto causaba errores de resolución de módulo en el bundler de Expo. Se detectó que el problema era una dependencia circular creada por el barrel export y se resolvió con tipos locales por pantalla.

**4. Configuración Keycloak:**
La IA generó configuración para Keycloak 22+ con claves de cliente que habían sido renombradas en esa versión. Como el proyecto usa una versión anterior, los valores no eran válidos. Se corrigió ajustando los nombres de parámetros a la versión efectivamente desplegada.