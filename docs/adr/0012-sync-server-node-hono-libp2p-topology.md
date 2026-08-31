# Compose the Sync Server as a Node/Hono/libp2p application

Status: accepted

`apps/sync-server` is Node.js-only. Hono owns management HTTP/API, built React/Vite assets and limited non-streaming React SSR with hydration; SSR is presentation, not an authorization boundary. libp2p owns authenticated WebSocket sync streams. A reverse proxy exposes one external HTTPS/WSS port and routes ordinary HTTP to Hono and WebSocket Upgrade traffic to libp2p.

Concrete infrastructure lives at `apps/sync-server/infrastructure/`, outside `src/`; `src/` contains configuration, runtime composition and application entry points, and `web/` contains management UI sources. The default development listener is configurable and binds `127.0.0.1:6000` with SQLite/filesystem and registration disabled. Production startup requires explicit provider and credential configuration.

Startup, readiness, admission, drain and shutdown are scoped Effect resources. Browser and device authentication adapters remain separate while reusing shared account-context services. Multi-instance Relay deployment requires sticky routing for connected peers; protected health, metrics and audit events are part of the operational interface.
