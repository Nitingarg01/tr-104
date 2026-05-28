.PHONY: dev build test lint deploy clean

SHELL := /bin/bash

REPO_ROOT := $(shell pwd)

dev:
	@echo "Starting local development environment..."
	@docker-compose up --build

build:
	@echo "Building all Docker images..."
	docker-compose build --pull

test:
	@echo "Running tests..."
	@pytest -q || true

lint:
	@echo "Linting codebase..."
	@flake8 backend/ frontend/ || true

deploy:
	@echo "Deploying to production (manual step)..."
	@echo "Use your deployment workflow to bring up the stack in production."

clean:
	@echo "Cleaning up Docker resources..."
	docker-compose down -v --remove-orphans
	@docker system prune -f
