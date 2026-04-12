# Eliminacion de vehiculos con consistencia eventual

## Objetivo

Al eliminar un vehiculo desde la tabla de vehiculos, el sistema debe:

1. Permitir dos modos: borrar solo vehiculo o borrar vehiculo + historico.
2. Invalidar su cache en Redis (telemetria reciente, dedupe y llaves de alertas).
3. Tolerar fallas temporales de Redis sin perder la consistencia final.

## Enfoque aplicado

Se implemento una estrategia de consistencia eventual con cola de invalidacion (patron Saga simplificado por compensacion/reintentos).

Flujo de alto nivel:

1. El frontend ejecuta `DELETE /api/v1/vehicles/{vehicle_id}?scope=...`.
2. `vehicle-service` abre transaccion en PostgreSQL.
3. Dentro de la transaccion:
   - Elimina el vehiculo de `vehicles`.
  - Si `scope=with_history`, elimina historico de `gps_locations` (si existe la tabla).
  - Si `scope=vehicle_only`, conserva el historico en `gps_locations`.
   - Inserta un job `pending` en `vehicle_cache_invalidation_jobs`.
4. Hace `COMMIT`.
5. Despues del commit, intenta invalidacion inmediata de cache.
6. Un worker en background reprocesa jobs `pending` con backoff hasta que la invalidacion en Redis sea exitosa.

Con esto, la eliminacion en persistencia es atomica y la cache converge a estado consistente aunque Redis falle temporalmente.

## Cambios realizados

### Backend

- Nuevo endpoint en `vehicle-service`:
  - `DELETE /api/v1/vehicles/{vehicle_id}?scope=vehicle_only|with_history`
- Se agrego Redis a `vehicle-service` para invalidacion de cache.
- Se incorporo worker de invalidacion periodica.
- Se creo tabla de jobs de invalidacion:
  - `vehicle_cache_invalidation_jobs`

Llaves de Redis invalidadas por vehiculo:

- `gps:recent:{vehicle_id}`
- `gps:last:{vehicle_id}`
- `alert:overspeed:{vehicle_id}`
- `alert:panic:{vehicle_id}`
- `gps:dedupe:{vehicle_id}:*` (scan + del)
- `alert:stopped:{vehicle_id}:*` (scan + del)

### Frontend

- Se agrego columna `Acciones` en la tabla de Vehiculos.
- Se agregaron dos botones por fila:
  - `Solo vehiculo` (conserva historico)
  - `Vehiculo + historico` (borra persistencia historica)
- Confirmacion de usuario previa a borrar.
- Actualizacion del estado local al eliminar con exito.

## Contrato del endpoint

### Request

- Metodo: `DELETE`
- URL: `/api/v1/vehicles/{vehicle_id}?scope=vehicle_only|with_history`

Reglas del parametro `scope`:

- `vehicle_only`: elimina solo de `vehicles` y conserva `gps_locations`.
- `with_history`: elimina de `vehicles` y tambien de `gps_locations`.
- Si no se envia, por defecto aplica `with_history`.

### Response OK (200)

```json
{
  "vehicle_id": "SIM-00001",
  "status": "deleted",
  "scope": "with_history",
  "cache_consistency": "eventual",
  "cache_invalidationJob": "queued"
}
```

### Errores comunes

- `400`: `vehicle_id` invalido
- `400`: `scope` invalido (debe ser `vehicle_only` o `with_history`)
- `404`: vehiculo no encontrado
- `500`: error interno de transaccion o persistencia

## Comportamiento ante fallas

- Si falla Redis al invalidar cache, el job permanece `pending`.
- El worker reintenta automaticamente usando backoff incremental (hasta 300 segundos).
- Cuando el borrado de cache es exitoso, el job pasa a `done`.

## Variables y despliegue

Se actualizo `deployments/docker-compose.yml` para `vehicle-service`:

- `REDIS_URL`
- `depends_on: redis`

## Validacion manual sugerida

1. Crear o ubicar un vehiculo existente.
2. Simular telemetria para generar llaves Redis del vehiculo.
3. Eliminar con opcion `Solo vehiculo` y verificar:
  - no existe en `vehicles`
  - sigue existiendo historico en `gps_locations`
4. Eliminar con opcion `Vehiculo + historico` y verificar:
  - no existe en `vehicles`
  - no existe historico en `gps_locations`
5. Verificar en Redis que no existan llaves relacionadas.
6. Si Redis estuvo caido durante el delete, revisar que el job quede `pending` y luego cambie a `done` al restablecer Redis.
