# Integrations, photo sync, and notification relays

Connect self-hosted **Immich** and **Synology Photos** servers for automated trip album synchronization, configure outbound push relays across **Pushify**, **Pushover**, **Ntfy**, and **Custom Webhooks**, and manage external Travelpayouts and transit fare API keys in **Settings** (`/config`).

## Synchronizing trip photos with Immich and Synology

Paladio syncs trip galleries bidirectionally against self-hosted photo vaults from **Settings** (`/config` under **Data Vault & Backups -> Photo Sync**), storing configuration safely in PostgreSQL `system_config`.

=== "Immich"

    1. Generate an Immich API key from your Immich **Account Settings -> API Keys**.
    2. In Paladio **Settings -> Data Vault & Backups -> Photo Sync**, enable **Immich**, enter your Immich server base URL (`immich_url`) and API key (`immich_api_key`), and specify the target album name (`immich_album_name`, default `Paladio Vault`).
    3. Click **Test Connection** (`POST /api/system/photo-sync/test`), then run **Sync All Vault Photos** (`POST /api/system/photo-sync/sync-all`) to upload existing expedition galleries.

=== "Synology Photos / WebDAV"

    1. Enable WebDAV or DSM access for a dedicated service user on your Synology NAS.
    2. In Paladio **Settings -> Data Vault & Backups -> Photo Sync**, enable **Synology**, fill in `synology_url`, `synology_username`, `synology_password`, and `synology_destination_path` (default `/photo/Paladio`).
    3. Click **Test Connection** and save to sync uploaded trip photos automatically.

## Configuring outbound notification relays

Receive real-time alerts outside the web UI whenever the Deal Engine flags a P10 flight+hotel package, a trip changes, a booking pass finishes scanning, or photo sync completes.

1. Open **Settings** (`/config` under **Notifications -> Notification Types**) and choose which event categories emit outbound relays (`Deal Alerts`, `Trip Updates`, `Ticket Parsing`, `Photo Sync`).
2. Configure one or more delivery channels in the remaining sub-tabs:
   - **Pushify**: Enter your Pushify endpoint/API token.
   - **Pushover & Ntfy**: Configure a Pushover application + user token (`api.pushover.net/1/messages.json`), or point Ntfy to `https://ntfy.sh` or your self-hosted Ntfy instance and topic.
   - **Custom Webhooks**: Supply any HTTPS webhook receiver URL for JSON event delivery.
3. Click **Test Delivery** (`POST /api/system/notifications/test`) on each enabled channel to confirm payloads arrive cleanly.

## Managing API keys and external secrets

Open **Settings** (`/config` under **API Keys & Secrets**) to store optional external provider credentials dynamically in PostgreSQL `system_config` (`key="secrets"`) without restarting containers.

- **Travelpayouts / Aviasales (`aviasales`)**: Enter your affiliate/data token to unlock cached route price sweeps in `/monitoring`; Paladio loads this token at startup and exposes a live test button (`POST /api/system/secrets/test/aviasales`) plus an environment-override indicator when `TRAVELPAYOUTS_TOKEN` or `AVIASALES_TOKEN` is already set in `.env`.
- **DeepL / LibreTranslate**: Set `DEEPL_API_KEY` or `LIBRETRANSLATE_URL` in `.env` when you want on-demand translation (`POST /api/pois/{poi_id}/translate`) for foreign-language POI descriptions.
- **Tokyo ODPT (`odpt`)**: Supply `ODPT_API_KEY` / `ODPT_CONSUMER_KEY` in `.env` if you compile Tokyo GTFS schedules and want official dynamic rail fare lookups via the ODPT adapter.
