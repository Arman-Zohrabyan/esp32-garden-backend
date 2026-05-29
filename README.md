# ESP32 Garden Backend

Backend and dashboard for battery-powered ESP32 soil-monitoring boards. Each board wakes on a timer, measures soil moisture and its own battery, optionally runs a pump, uploads what it gathered, and goes back to deep sleep. This service stores all of that, hands the board its configuration, and serves a dashboard to read it.

Built with NestJS + PostgreSQL (TypeORM). The dashboard is plain HTML/CSS/JS served straight from `public/` — no frontend build step.

Full API and database reference: [docs/ESP32_API.md](docs/ESP32_API.md).

## What it does

**Device configuration without polling.** `Device`, `SoilSettings` and `PumpSettings` each carry a `revision` the server bumps whenever a value changes. The board reports the revision it has applied, compares it to the one it gets back, and only reacts when they differ — so changing the sleep interval from the dashboard takes effect on the board's next wake with no extra round-trips.

**One call per wake.** `POST /devices/by-chip/:chipId/sync` replaces what used to be registration, a heartbeat, a settings fetch and two confirmations. An unknown chip ID creates the device and its default rows, so a new board and a wiped database follow the identical path. `POST .../report` then uploads readings, logs and pump runs in a single request.

**Survives being offline.** Readings buffered in RTC memory across a failed upload are resent with their original wake counter, so they land at the right point on a chart rather than where they happened to be accepted.

**Dashboard.** Device list with live status, per-device charts, and a filterable log viewer. Battery and soil histories are split into cycles — a battery cycle starts at a charge, a soil cycle at a watering — and each is charted separately, so "how long does one charge last" and "how fast does the soil dry out" are answerable at a glance. Device status (online / sleeping / offline) is derived from the board's own configured interval rather than a fixed timeout, so a board that sleeps three hours isn't reported as missing.

## Requirements

- Node.js 20+
- PostgreSQL 14+ (the database is created on first start if it doesn't exist)

## Setup

```bash
npm install
cp .env.example .env   # then fill in the database credentials
npm run build
npm run start:prod
```

The dashboard and the API are both served on `PORT` (default `3055`): open `http://localhost:3055`.

For development with reload on change:

```bash
npm run start:dev
```

### Environment

See [.env.example](.env.example). `DB_*` configure PostgreSQL, `PORT` sets the listening port, and `ADMIN_TOKEN` guards writes (below).

`synchronize: true` is enabled outside production — the schema follows the entity definitions on every start. There are no migrations, so treat a production deployment as needing its own migration story.

## Access control

Reads are public: every `GET` works without credentials, which is what the dashboard relies on.

Writes (`POST`, `PUT`, `PATCH`, `DELETE`) require the admin token as a header, or they are rejected with 401:

```
X-Admin-Token: <ADMIN_TOKEN>
```

The dashboard asks for the token the first time you change something and remembers it in the browser. The three firmware routes — `sync`, `report` and `watering` under `/devices/by-chip/:chipId/` — are exempt, since the board has nowhere safe to keep a secret. Leaving `ADMIN_TOKEN` empty disables write protection entirely.

The token travels in plain HTTP, so put the service behind TLS before exposing it beyond a trusted network.

## Layout

```
src/
  devices/              device CRUD, plus the firmware-facing sync/report/watering
  soil-settings/        per-device sensor calibration (revision-synced)
  soil-readings/        moisture history
  pump-settings/        auto-watering configuration (revision-synced)
  watering-logs/        one row per pump run
  battery/              one row per tracked cell (esp32, pump)
  battery-logs/         voltage and charge history
  battery-normalization/ voltage-to-percentage calibration points
  device-logs/          diagnostic events from the firmware
  common/               AdminTokenGuard
public/
  index.html            device list
  device.html           device detail (?id=...)
  logs.html             log viewer (?id=...)
  shared.js             charts, cycle splitting, formatting, admin fetch
  i18n.js               English and Russian strings
docs/ESP32_API.md       endpoint and schema reference
```

## Running in production

The deployment this repository was written against runs under pm2 as `esp32`. After changing anything under `src/`, rebuild before restarting — pm2 runs the compiled `dist/main.js`:

```bash
npm run build
pm2 restart esp32
```

Files under `public/` are served from disk, so a browser refresh is enough for frontend edits.
