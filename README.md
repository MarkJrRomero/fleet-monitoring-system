# Fleet Monitoring System

Base del proyecto para monitoreo de flotas. Actualmente incluye el frontend inicial en React + TypeScript y un flujo de despliegue estandarizado con Makefile.

## Estado actual

- Frontend base en React + TypeScript (Vite)
- Despliegue local con Docker Compose
- Operacion unificada con Makefile (`make up`, `make down`, `make logs`, etc.)

## Estructura del repositorio

```text
deployments/   # Orquestacion y despliegue
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
make help
make doctor
make up
```

La app quedara disponible en `http://localhost:5173`.

Para apagar el stack:

```bash
make down
```

## Comandos principales

| Comando | Descripcion |
|---|---|
| `make up` | Sube todo el stack (hoy: frontend) |
| `make down` | Baja todo el stack |
| `make ps` | Muestra estado de servicios |
| `make logs SERVICE=frontend` | Sigue logs del servicio |
| `make restart SERVICE=frontend` | Reinicia un servicio |
| `make build` | Rebuild de imagenes |
| `make pull` | Pull de imagenes remotas |

## Flujo de frontend sin Docker (opcional)

```bash
cd frontend
npm install
npm run dev
```

Build de verificacion:

```bash
cd frontend
npm run build
```

## Notas de arquitectura

- El comando operativo principal es `make up`.
- A medida que se agreguen servicios en `services/` y `deployments/docker-compose.yml`, se levantaran automaticamente con el mismo flujo.
- Objetivo: mantener una interfaz unica de operacion para todo el sistema.