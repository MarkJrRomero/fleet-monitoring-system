SHELL := /bin/bash

.DEFAULT_GOAL := help

PROJECT_NAME ?= fleet-monitoring-system
ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
FRONTEND_DIR := $(ROOT_DIR)/frontend
DEPLOYMENTS_DIR := $(ROOT_DIR)/deployments
COMPOSE_FILE := $(DEPLOYMENTS_DIR)/docker-compose.yml
SERVICE ?= frontend

COMPOSE_CMD := $(shell \
	if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
		echo "docker compose"; \
	elif command -v docker-compose >/dev/null 2>&1; then \
		echo "docker-compose"; \
	fi)

define REQUIRE_CMD
	@command -v $(1) >/dev/null 2>&1 || { echo "[ERROR] Missing command: $(1)"; exit 1; }
endef

define REQUIRE_COMPOSE
	@test -n "$(COMPOSE_CMD)" || { echo "[ERROR] Docker Compose not found (docker compose / docker-compose)"; exit 1; }
endef

.PHONY: help doctor \
	frontend-install frontend-dev frontend-build frontend-preview \
	compose-config compose-build compose-up compose-down compose-stop compose-restart compose-ps compose-logs compose-pull \
	deploy undeploy up down stop restart ps logs build pull

help: ## Lista los comandos disponibles
	@echo ""
	@echo "$(PROJECT_NAME) - Makefile"
	@echo ""
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Ejemplo: make compose-up"

doctor: ## Valida prerrequisitos de herramientas y archivos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_CMD,npm)
	$(call REQUIRE_COMPOSE)
	@test -f "$(COMPOSE_FILE)" || { echo "[ERROR] Missing compose file: $(COMPOSE_FILE)"; exit 1; }
	@test -f "$(FRONTEND_DIR)/package.json" || { echo "[ERROR] Missing frontend package.json"; exit 1; }
	@echo "[OK] Environment is ready"

frontend-install: ## Instala dependencias del frontend
	$(call REQUIRE_CMD,npm)
	@cd "$(FRONTEND_DIR)" && npm install

frontend-dev: ## Ejecuta frontend en modo desarrollo
	$(call REQUIRE_CMD,npm)
	@cd "$(FRONTEND_DIR)" && npm run dev

frontend-build: ## Compila frontend para produccion
	$(call REQUIRE_CMD,npm)
	@cd "$(FRONTEND_DIR)" && npm run build

frontend-preview: ## Levanta preview de build de frontend
	$(call REQUIRE_CMD,npm)
	@cd "$(FRONTEND_DIR)" && npm run preview

compose-config: ## Valida y muestra configuracion final de Docker Compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" config

compose-build: ## Construye imagenes de servicios definidos en compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" build

compose-up: ## Despliega servicios en segundo plano (build incluido)
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" up --build -d

compose-down: ## Elimina servicios, redes y recursos de compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" down

compose-stop: ## Detiene servicios sin eliminarlos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" stop

compose-restart: ## Reinicia un servicio (SERVICE=<nombre>) o todos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@if [ "$(SERVICE)" = "all" ]; then \
		$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" restart; \
	else \
		$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" restart "$(SERVICE)"; \
	fi

compose-ps: ## Muestra estado de servicios desplegados
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" ps

compose-logs: ## Sigue logs de un servicio (SERVICE=<nombre>) o todos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@if [ "$(SERVICE)" = "all" ]; then \
		$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" logs -f --tail=200; \
	else \
		$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" logs -f --tail=200 "$(SERVICE)"; \
	fi

compose-pull: ## Hace pull de imagenes remotas definidas en compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) -f "$(COMPOSE_FILE)" pull

deploy: doctor compose-up ## Flujo recomendado de despliegue local

undeploy: compose-down ## Flujo recomendado para bajar despliegue

# Alias de operacion rapida (estilo senior ops)
up: deploy ## Sube todo el stack (hoy: frontend)

down: undeploy ## Baja todo el stack

stop: compose-stop ## Detiene todo el stack sin eliminar recursos

restart: compose-restart ## Reinicia servicios (SERVICE=frontend o SERVICE=all)

ps: compose-ps ## Lista estado de servicios

logs: compose-logs ## Sigue logs (SERVICE=frontend o SERVICE=all)

build: compose-build ## Rebuild de imagenes del stack

pull: compose-pull ## Pull de imagenes remotas del stack
