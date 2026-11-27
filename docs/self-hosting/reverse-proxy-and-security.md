# Reverse proxy, security, and access control

Expose Paladio safely behind **Caddy**, **Nginx**, or **Traefik** with WebSocket upgrade support for `/api/ws/*` and `/mcp`, enforce production cryptographic keys, manage trip Role-Based Access Control (RBAC), and reset locked-out passwords from the server CLI.

## Production security checklist

Running Paladio on a LAN or public domain with `ENVIRONMENT=production` activates strict startup and encryption invariants across `backend/app/core/`.

1. **Generate dedicated secrets**: Set high-entropy values for `POSTGRES_PASSWORD`, `JWT_SECRET_KEY` (`openssl rand -hex 32`), and `WALLET_ENCRYPTION_KEY` (valid 32-byte URL-safe base64 Fernet key generated via `openssl rand 32 | openssl base64 -A | tr '+/' '-_'`). If `JWT_SECRET_KEY` or `WALLET_ENCRYPTION_KEY` is omitted, Paladio auto-generates and persists `0600` keys in `/data/.jwt_secret` and `/data/.wallet_key` when the `/data` volume is writable, and fails fast in `ENVIRONMENT=production` if `/data` is not writable.
2. **Restrict CORS origins & configure public API URL**: When exposing Paladio at a public domain behind TLS, set `ALLOWED_ORIGINS=https://paladio.example.com` on `api` and `PALADIO_PUBLIC_API_URL=https://paladio.example.com/api` on `frontend`.
3. **Keep public registration closed**: Leave `ALLOW_PUBLIC_REGISTRATION=false` (the default) and create household or team accounts from **Settings** (`/config` under **Authorized Users**).
4. **Keep internal services off the host**: `docker-compose.yml` keeps PostgreSQL (`5432`), Redis (`6379`), and Valhalla (`8002`) strictly on the internal Docker network so only `frontend` (`3000`) and `api` (`8000`) bind host ports (add `docker-compose.dev.yml` if you need localhost DB/Redis/Valhalla ports for development).

## Reverse proxy configurations (with WebSockets)

Route `/api/*` and `/mcp` to `127.0.0.1:8000` (backend FastAPI) and all remaining traffic to `127.0.0.1:3000` (Next.js frontend), preserving `Upgrade` and `Connection` headers for `/api/ws/stream` and `/api/ws/trip-agent/{trip_id}`.

=== "Caddy"

    ```caddyfile
    paladio.example.com {
        handle /api/* {
            reverse_proxy 127.0.0.1:8000
        }
        handle /mcp* {
            reverse_proxy 127.0.0.1:8000
        }
        handle {
            reverse_proxy 127.0.0.1:3000
        }
    }
    ```

=== "Nginx"

    ```nginx
    server {
        listen 443 ssl http2;
        server_name paladio.example.com;

        location /api/ {
            proxy_pass http://127.0.0.1:8000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 3600s;
        }

        location /mcp {
            proxy_pass http://127.0.0.1:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_buffering off;
        }

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    ```

=== "Traefik (Docker labels)"

    ```yaml
    # Add these labels to your api and frontend services when routing via Traefik:
    # api:
    #   - "traefik.http.routers.paladio-api.rule=Host(`paladio.example.com`) && (PathPrefix(`/api`) || PathPrefix(`/mcp`))"
    #   - "traefik.http.services.paladio-api.loadbalancer.server.port=8000"
    # frontend:
    #   - "traefik.http.routers.paladio-ui.rule=Host(`paladio.example.com`)"
    #   - "traefik.http.services.paladio-ui.loadbalancer.server.port=3000"
    ```

## Authentication, trip RBAC, and password resets

Paladio protects user credentials with `PBKDF2-HMAC-SHA256` (100,000 iterations, 32-byte random salt, constant-time `hmac.compare_digest`), HS256 JWTs, and three-tier per-trip access control (`core/access.py`).

- **Trip access levels**: `OWNER` (`trip.user_id == user.id`), `EDITOR` (any `TripParticipantModel` linked to that user account), and `VIEWER` (read-only access enforced by `assert_trip_access`). Legacy local trips with `trip.user_id IS NULL` grant local owner access automatically in single-user self-hosted deployments.
- **Sovereign CLI password reset**: If an administrator loses their password, reset it directly on the host without external recovery emails:

```bash
docker compose exec api python scripts/reset_password.py admin new_strong_password_here
```
