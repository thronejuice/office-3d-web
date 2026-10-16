# Office3D

ออฟฟิศเสมือน 3 มิติสำหรับใช้ภายในบริษัท (แนว Gather.town): พนักงานล็อกอิน เดินในออฟฟิศมุมไอโซเมตริก และคุยด้วยเสียงกับคนที่อยู่ใกล้ — เสียงเท่านั้น ไม่มีวิดีโอ/แชต

A self-hosted 3D virtual office with proximity voice for ≤ ~20 people on a company LAN/VPN.
Stack: pnpm monorepo · React + react-three-fiber · Fastify + Socket.IO · PostgreSQL (Drizzle) · WebRTC audio mesh · coturn · Caddy.

```
apps/web         Vite + React + R3F client (Thai UI: src/strings.th.ts)
apps/server      Fastify + Socket.IO server, Drizzle migrations in apps/server/drizzle
packages/shared  Types, protocol, map schema (Zod), A*, voice rules and every audio constant
e2e              Playwright tests (2–3 browsers, fake microphones)
deploy           Caddyfile, Dockerfiles
docs             Thai IT guide for the HTTPS certificate
```

## Deploy (Docker Compose)

Requirements: a Linux server with Docker + Compose v2, reachable only from the LAN/VPN.

```bash
cp .env.example .env      # then edit it (see below)
docker compose up -d --build
```

Open `https://<OFFICE_HOST>` and log in with `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`; you are forced to change the password first.

Browsers allow the microphone only over HTTPS, and there is no public domain, so Caddy signs the site with its own internal CA.
**Every device must trust that CA once** — follow [docs/IT-GUIDE.th.md](docs/IT-GUIDE.th.md) (Windows, macOS, Android, iOS, Firefox, hosts-file/DNS entry). The CA is downloadable from `http://<OFFICE_HOST>/ca.crt`.

### Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `OFFICE_HOST` | Hostname or IP users type (`office.local`, `10.0.0.5`). The certificate is issued for it. |
| `LAN_IP` | The server's LAN IP. coturn binds to it and clients use it as TURN relay. |
| `POSTGRES_PASSWORD` | Database password. |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | First admin; only created while no admin exists. |
| `TURN_SECRET` | Shared secret for time-limited TURN credentials (`openssl rand -hex 24`). |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | Optional. Put a real certificate in `./certs` and set e.g. `/certs/office.crt` and `/certs/office.key`; leave empty for the internal CA. Then `docker compose up -d caddy`. |

Firewall (LAN/VPN only): `80/tcp`, `443/tcp`, `3478/udp+tcp` and `49160-49200/udp` (TURN relay). Do **not** expose any of them to the internet.

**TURN relay on Docker Desktop (Windows / WSL / macOS):** coturn uses `network_mode: host`, which on Docker Desktop is the Docker VM and not your machine, so it cannot bind `LAN_IP` and restarts in a loop (`Cannot assign requested address`). That only affects development machines: on the Linux server the app is meant for, `LAN_IP` is the server's own address and coturn works. On a dev machine just run `docker compose stop coturn`; voice between browsers on the same network does not need the relay.

### Backup / restore

```bash
# backup (one line)
docker compose exec -T postgres pg_dump -U office office | gzip > office-$(date +%F).sql.gz

# restore into a fresh stack
gunzip -c office-2025-01-01.sql.gz | docker compose exec -T postgres psql -U office office
```

The map and all versions, users and avatars live in this database. Caddy's CA lives in the `caddy-data` volume — keep it, otherwise every device must install a new certificate.

### Operations

* Update: `git pull && docker compose up -d --build` (migrations run on server start).
* Logs: `docker compose logs -f server`.
* Admin UI: `/admin` (users), `/admin/map` (map editor). Both are admin-only.

## Music zones and game tables

Zones have a kind (meeting / music / game), set in the Map Editor (`/admin/map` → zone tool). Music zones play a nature loop (rain, forest + birds, sea, stream) only for people standing in them. Game tables are the "โต๊ะเกม" furniture item: players walk up, sit, and play Texas Hold'em, chess, Uno, Pok Deng or Bingo (server-authoritative, kept in memory; poker chips are play money). Details and rules: [SPEC-ZONES.md](SPEC-ZONES.md); sound sources and licenses: [ASSETS.md](ASSETS.md).

## Development

```bash
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres     # needs .env
DATABASE_URL=postgres://office:$POSTGRES_PASSWORD@localhost:5432/office INITIAL_ADMIN_PASSWORD=dev-admin-pw pnpm dev:server
pnpm dev:web              # http://localhost:5173 (localhost counts as a secure context, mic works)
```

## Tests

```bash
pnpm typecheck
pnpm test                 # Vitest: gain, zone/DND audibility, hysteresis, A*, map schema + publish validation, auth, every game engine, game tables
pnpm e2e:isolated         # Playwright against a throw-away stack (see below)
```

First time only: `cd e2e && npx playwright install chromium`.
The e2e suite uses fake microphones and asserts real peer connections (open/close distances, zone walls, DND), gain values, knocks, forced kick, live map publish, nature-sound zones and every game table (poker, chess, Uno, Pok Deng, Bingo), keyboard use of the chess board, and the error boundaries.

**The e2e tests are destructive** (they reset the map to the seed and create users), so they never run against the stack people use. `pnpm e2e:isolated` builds a separate Compose project (`office3d-test`: its own database volume, `https://localhost:18443`, no TURN relay, values from `.env.test`), runs the suite and deletes the stack afterwards. `pnpm e2e:up` / `pnpm e2e:down` start and remove it by hand. `pnpm e2e` on its own refuses to start unless `E2E_ALLOW_DESTRUCTIVE=1` is set, which is only meant for a stack you can throw away.

More: [DECISIONS.md](DECISIONS.md) (every choice not fixed by the spec, and known gaps) · [ASSETS.md](ASSETS.md) (3D assets, fonts, licenses).
