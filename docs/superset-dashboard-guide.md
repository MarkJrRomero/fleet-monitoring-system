# Guia de Dashboards en Superset

Esta guia resume la configuracion recomendada para construir dashboards de sustentacion sobre `telemetry_history` en Apache Superset.

## Conexion a ClickHouse

- Nombre sugerido de la conexion: `ClickHouse Fleet Analytics`
- Host interno: `clickhouse`
- Puerto HTTP: `8123`
- Base de datos: `default`
- URI de conexion registrada en Superset:

```text
clickhouse://default:clickhouse@clickhouse:8123/default
```

## Requisito para mapas geoespaciales

Los charts `Deck.gl` de Superset necesitan un token de Mapbox para dibujar el mapa base.

- Variable requerida en `.env`: `MAPBOX_API_KEY`
- Ejemplo:

```text
MAPBOX_API_KEY=pk.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Si el token no esta configurado:

- el dataset y la agregacion se calculan bien,
- las celdas del heatmap pueden aparecer,
- pero el fondo del mapa se vera blanco o sin tiles.

## Troubleshooting: MEMORY_LIMIT_EXCEEDED en heatmaps

Si Superset muestra `DB::Exception: MEMORY_LIMIT_EXCEEDED` al generar mapas o agregaciones:

- Aplica filtro temporal (ej. ultimas 24h o 7 dias) en `timestamp`.
- Evita agrupar por coordenadas crudas si no necesitas precision completa.
- Prefiere una consulta bucketizada para reducir cardinalidad:

```sql
SELECT
  round(lat, 3) AS lat_bucket,
  round(lng, 3) AS lng_bucket,
  count() AS traffic_count
FROM telemetry_history
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY lat_bucket, lng_bucket
ORDER BY traffic_count DESC
LIMIT 5000
```

En infraestructura local, este repositorio ya aplica tuning de ClickHouse para permitir `external group by` y mayor margen de memoria por consulta.

## Dataset recomendado

- Dataset principal: `default.telemetry_history`
- Campos clave:
  - `vehicle_id`
  - `lat`
  - `lng`
  - `speed`
  - `timestamp`
  - `event_type`

## Consultas SQL para dashboards

### 1. Mapa de calor de trafico historico

Agrupa las coordenadas por celdas geograficas para pintar las zonas con mayor trafico.

```sql
SELECT
  round(lat, 2) AS lat_bucket,
  round(lng, 2) AS lng_bucket,
  count() AS traffic_count
FROM telemetry_history
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY lat_bucket, lng_bucket
ORDER BY traffic_count DESC
```

Visual recomendado en Superset:

- Deck.gl Grid o mapa de calor geoespacial.
- Latitud: `lat_bucket`
- Longitud: `lng_bucket`
- Intensidad: `traffic_count`

### 2. Grafico de barras de alertas por vehiculo

Con el esquema actual, `telemetry_history` distingue `ALERT` vs `HEARTBEAT`, pero no persiste el subtipo de alerta. Para una sustentacion funcional, se puede aproximar la alerta de `Vehiculo detenido` filtrando registros alertados con velocidad cero.

```sql
SELECT
  vehicle_id,
  count() AS stopped_alerts_24h
FROM telemetry_history
WHERE event_type = 'ALERT'
  AND speed = 0
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY vehicle_id
ORDER BY stopped_alerts_24h DESC
LIMIT 10
```

Si luego se extiende el modelo con `alert_type`, esta consulta debe migrarse a un filtro exacto por `Vehiculo detenido`.

### 3. Indicador de velocidad media

Ideal para un `Big Number` o KPI por rango temporal.

```sql
SELECT
  round(avg(speed), 2) AS average_speed_kmh
FROM telemetry_history
WHERE timestamp >= now() - INTERVAL 1 HOUR
```

Version temporal para serie de linea:

```sql
SELECT
  toStartOfMinute(timestamp) AS minute_bucket,
  round(avg(speed), 2) AS average_speed_kmh
FROM telemetry_history
WHERE timestamp >= now() - INTERVAL 24 HOUR
GROUP BY minute_bucket
ORDER BY minute_bucket
```

## Recomendaciones de presentacion

- Dashboard 1: `Resumen operativo`
  - KPI de velocidad media
  - Total de eventos por hora
  - Alertas de las ultimas 24 horas
- Dashboard 2: `Analitica geografica`
  - Heatmap de trafico
  - Top 10 vehiculos con mas actividad
- Dashboard 3: `Riesgo y comportamiento`
  - Alertas por vehiculo
  - Trazado temporal de velocidad promedio

## Justificacion tecnica

- Escalabilidad: separar la visualizacion analitica en Superset reduce presion sobre el frontend React y evita cargar el backend operacional con consultas pesadas de reporting.
- Stack tecnologico: incorporar Superset mantiene alineacion con patrones enterprise usados frecuentemente junto con motores analiticos columnares como Druid y ClickHouse.
- Valor de negocio: los administradores pueden construir dashboards y reportes personalizados sin depender de cambios de desarrollo en la aplicacion transaccional.
