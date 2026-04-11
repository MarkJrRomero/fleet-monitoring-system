# Fleet Monitoring System

Base del proyecto para monitoreo de flotas. Actualmente incluye el frontend inicial en React + TypeScript y un flujo de despliegue estandarizado con Makefile.

## Estado actual

- Frontend base en React + TypeScript
- Keycloak en Docker para flujo de autenticación
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
| `make up` | Sube todo el stack (frontend + keycloak) |
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
	- `INGESTION_SERVICE_PORT`, `NOTIFICATION_SERVICE_PORT`

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
- A medida que se agreguen servicios en `services/` y `deployments/docker-compose.yml`, se levantaran automaticamente con el mismo flujo.
- Objetivo: mantener una interfaz unica de operacion para todo el sistema.