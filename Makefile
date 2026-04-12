SHELL := /bin/bash

.DEFAULT_GOAL := help

PROJECT_NAME ?= fleet-monitoring-system
ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
FRONTEND_DIR := $(ROOT_DIR)/frontend
DEPLOYMENTS_DIR := $(ROOT_DIR)/deployments
COMPOSE_FILE := $(DEPLOYMENTS_DIR)/docker-compose.yml
KEYCLOAK_REALM_FILE := $(ROOT_DIR)/.docker/keycloak/realm-export.json
ENV_FILE := $(ROOT_DIR)/.env
ENV_TEMPLATE := $(ROOT_DIR)/.env.example
COMPOSE_ARGS := --env-file "$(ENV_FILE)" -f "$(COMPOSE_FILE)"
DOWN_ARGS ?=
SERVICE ?= all

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
	compose-config compose-build compose-up compose-down compose-delete compose-stop compose-restart compose-ps compose-logs compose-pull \
	deploy undeploy up down delete stop restart ps logs build pull env-init

help: ## Lista los comandos disponibles
	@echo ""
	@echo "$(PROJECT_NAME) - Makefile"
	@echo ""
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Ejemplo: make compose-up"

env-init: ## Crea .env local desde .env.example (si no existe)
	@test -f "$(ENV_TEMPLATE)" || { echo "[ERROR] Missing env template: $(ENV_TEMPLATE)"; exit 1; }
	@if [ -f "$(ENV_FILE)" ]; then \
		echo "[INFO] .env already exists"; \
	else \
		cp "$(ENV_TEMPLATE)" "$(ENV_FILE)"; \
		echo "[OK] Created .env from .env.example"; \
	fi

doctor: ## Valida prerrequisitos de herramientas y archivos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_CMD,npm)
	$(call REQUIRE_COMPOSE)
	@test -f "$(ENV_TEMPLATE)" || { echo "[ERROR] Missing env template: $(ENV_TEMPLATE)"; exit 1; }
	@test -f "$(ENV_FILE)" || { echo "[ERROR] Missing .env file. Run: make env-init"; exit 1; }
	@test -f "$(COMPOSE_FILE)" || { echo "[ERROR] Missing compose file: $(COMPOSE_FILE)"; exit 1; }
	@test -f "$(FRONTEND_DIR)/package.json" || { echo "[ERROR] Missing frontend package.json"; exit 1; }
	@test -f "$(KEYCLOAK_REALM_FILE)" || { echo "[ERROR] Missing keycloak realm export: $(KEYCLOAK_REALM_FILE)"; exit 1; }
	@echo "[OK] Environment is ready (.env loaded from $(ENV_FILE))"

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
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) config

compose-build: ## Construye imagenes de servicios definidos en compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) build

compose-up: ## Despliega servicios en segundo plano (build incluido)
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) up --build -d

compose-down: ## Elimina servicios, redes y recursos de compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) down $(DOWN_ARGS)

compose-delete: ## Elimina stack completo: servicios, redes, volumenes e imagenes locales
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) down --volumes --remove-orphans --rmi local

compose-stop: ## Detiene servicios sin eliminarlos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) stop

compose-restart: ## Reinicia un servicio (SERVICE=<nombre>) o todos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@if [ "$(SERVICE)" = "all" ]; then \
		$(COMPOSE_CMD) $(COMPOSE_ARGS) restart; \
	else \
		$(COMPOSE_CMD) $(COMPOSE_ARGS) restart "$(SERVICE)"; \
	fi

compose-ps: ## Muestra estado de servicios desplegados
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) ps

compose-logs: ## Sigue logs de un servicio (SERVICE=<nombre>) o todos
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@if [ "$(SERVICE)" = "all" ]; then \
		$(COMPOSE_CMD) $(COMPOSE_ARGS) logs -f --tail=200; \
	else \
		$(COMPOSE_CMD) $(COMPOSE_ARGS) logs -f --tail=200 "$(SERVICE)"; \
	fi

compose-pull: ## Hace pull de imagenes remotas definidas en compose
	$(call REQUIRE_CMD,docker)
	$(call REQUIRE_COMPOSE)
	@$(COMPOSE_CMD) $(COMPOSE_ARGS) pull

deploy: doctor compose-up ## Flujo recomendado de despliegue local

undeploy: compose-down ## Flujo recomendado para bajar despliegue

# Alias de operacion rapida (estilo senior ops)
up: deploy ## Sube todo el stack (hoy: frontend)

down: undeploy ## Baja todo el stack

delete: compose-delete ## Baja y borra todo (incluye volumenes e imagenes locales)

stop: compose-stop ## Detiene todo el stack sin eliminar recursos

restart: compose-restart ## Reinicia servicios (SERVICE=frontend, keycloak o all)

ps: compose-ps ## Lista estado de servicios

logs: compose-logs ## Sigue logs (SERVICE=frontend, keycloak o SERVICE=all)

build: compose-build ## Rebuild de imagenes del stack

pull: compose-pull ## Pull de imagenes remotas del stack
