# Universal AI Live Captioning & Video Intelligence System

This project provides a Docker-based, CI/CD-enabled infrastructure for a podcast transcription system with real-time captions and video intelligence.

Features
- FastAPI backend with optional GPU support for heavy inference
- Next.js frontend with realtime caption streaming via WebSockets
- Redis-backed task queue and PostgreSQL metadata storage
- Celery workers for background processing
- Nginx reverse proxy with WebSocket support and static asset caching
- Docker Compose-based local development and production-ready Dockerfiles
- GitHub Actions CI/CD workflows for linting, testing, building, and deployment

Quick start
- Copy .env.example to .env and customize variables as needed
- Start the stack locally: make dev
- Access UI at http://localhost:3000 and API at http://localhost:8000

Development setup
- Uses docker-compose to orchestrate services
- Backend lives under backend/, frontend under frontend/
- Nginx in front for production-grade routing and WebSocket support

Architecture overview
- Backend: FastAPI app exposing REST APIs and WebSocket endpoints for live captions
- Backend: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
- Frontend: Next.js app providing the user interface
- Frontend: npm run dev
- Worker: Celery worker handling background transcription tasks
- Redis: Message broker and cache
- Postgres: Metadata storage
- Nginx: Reverse proxy and WebSocket terminator/proxy

Deployment guide
- Use the provided GitHub Actions workflows to build and deploy to staging/production
- Ensure environment variables are provided via the repository's secrets or an .env file in production
