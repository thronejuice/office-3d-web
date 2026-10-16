# Office3D

ออฟฟิศเสมือน 3 มิติสำหรับใช้ภายในบริษัท (แนว Gather.town): พนักงานล็อกอิน เดินในออฟฟิศมุมไอโซเมตริก และคุยด้วยเสียงกับคนที่อยู่ใกล้ — เสียงเท่านั้น ไม่มีวิดีโอ/แชต

A self-hosted 3D virtual office with proximity voice for ≤ ~20 people on a company LAN/VPN.

Repository: <https://github.com/thronejuice/office-3d-web>

## Features

**Office and movement**
* Isometric 3D office rendered with React Three Fiber; every player is a procedural "Chibi" avatar with idle, walk, sit, blink, speaking and emote animations.
* Move by clicking the floor or with the keyboard; paths are found with A* (shared between client and server).
* Furniture, wall art and TV screens are placed from the map; players can sit at desks and edit their own desk.
* Name tags and camera follow are handled per frame without React re-renders.

**Proximity voice**
* Voice is a WebRTC audio mesh: you hear people near you, and volume falls off with distance.
* Zones and walls block audio, so people in different rooms do not hear each other.
* Do-not-disturb (DND) mutes incoming audio; per-person mute is available.
* Knock on a player to ask them to talk; knocks you miss are kept until you clear them.
* TURN relay (coturn) with time-limited credentials for clients that cannot connect directly.

**Presence and social**
* Status: `available`, `busy`, `dnd`, `away`. The client goes `away` when the tab is hidden or after 10 minutes idle.
* Emotes: wave, clap, thumbs-up, and raise hand.
* Avatar customization in the Customizer panel (saved per user).

**Zones and games**
* Map zones have a kind: meeting, music or game. Set them in the Map Editor.
* Music zones play a nature loop (rain, forest with birds, sea, stream) only to people standing in them.
* Game tables are server-authoritative and kept in memory: Texas Hold'em, Chess, Uno, Pok Deng and Bingo. Poker chips are play money handed out on sitting.
* Rules and decisions: [SPEC-ZONES.md](SPEC-ZONES.md).

**Accounts and admin**
* Login with username and password (Argon2 hashes). Sessions use an httpOnly cookie; only a SHA-256 of the token is stored.
* Login is rate-limited per username and per IP.
* The first admin is created from `.env`. The first login forces a password change.
* Admin (`/admin`): list users, create users, and reset passwords (a reset also logs the user out).
* Map Editor (`/admin/map`): edit a draft, publish it, and roll back to an earlier version. Only admins can use it.
* The UI is in Thai (`apps/web/src/strings.th.ts`).

**Deployment**
* Docker Compose stack: Caddy (HTTPS and reverse proxy), web (static build), server, PostgreSQL and coturn.
* Caddy signs the site with its own internal CA by default; a real certificate can be used instead.

## Technology

| Layer | Technology |
|---|---|
| Language | TypeScript 5.6 across all packages |
| Monorepo | pnpm workspaces (`apps/web`, `apps/server`, `packages/shared`, `e2e`) |
| Client | React 19, Vite 6, React Three Fiber 9, drei 10, Three.js 0.172, Zustand 5, socket.io-client 4.8, `@fontsource/noto-sans-thai` |
| Server | Node.js, Fastify 5, `@fastify/cookie`, Socket.IO 4.8, Zod 3 |
| Data | PostgreSQL with Drizzle ORM 0.38 (`pg` driver); migrations in `apps/server/drizzle`; Argon2 for passwords |
| Realtime voice | WebRTC audio mesh, coturn (TURN) |
| Infrastructure | Docker Compose, Caddy (internal CA or your own cert) |
| Tests | Vitest 2 (unit), Playwright (end-to-end with fake microphones) |

Shared code lives in `packages/shared`: types, the protocol, the map schema (Zod), A*, voice rules and audio constants.

```
apps/web         Vite + React + R3F client (Thai UI: src/strings.th.ts)
apps/server      Fastify + Socket.IO server, Drizzle migrations in apps/server/drizzle
packages/shared  Types, protocol, map schema (Zod), A*, voice rules and every audio constant
e2e              Playwright tests (2–3 browsers, fake microphones)
deploy           Caddyfile, Dockerfiles
docs             Thai IT guide for the HTTPS certificate
```

## Installation (Deploy with Docker Compose)

Requirements: a Linux server with Docker + Compose v2, reachable only from the LAN/VPN.

```bash
git clone https://github.com/thronejuice/office-3d-web.git office3d
cd office3d
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

## Usage

1. Open `https://<OFFICE_HOST>` on a device that trusts the CA, and log in.
2. Change the password when prompted.
3. Click the floor or use the arrow keys / WASD to walk. Players within earshot can talk to you automatically.
4. Set your status (`busy`, `dnd`, ...), send an emote, or knock on a player.
5. Walk to a game table to sit down and play, or into a music zone to hear its loop.
6. Customize your avatar and desk from the in-game panels.
7. Admins: manage users at `/admin` and edit the office at `/admin/map`.

## Development

```bash
git clone https://github.com/thronejuice/office-3d-web.git office3d
cd office3d
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres     # needs .env
DATABASE_URL=postgres://office:$POSTGRES_PASSWORD@localhost:5432/office INITIAL_ADMIN_PASSWORD=dev-admin-pw pnpm dev:server
pnpm dev:web              # http://localhost:5173 (localhost counts as a secure context, mic works)
```

Requirements: Node.js and pnpm (the repo pins `pnpm@12.11.2`), Docker for PostgreSQL.

## Tests

```bash
pnpm typecheck
pnpm test                 # Vitest: gain, zone/DND audibility, hysteresis, A*, map schema + publish validation, auth, every game engine, game tables
pnpm e2e:isolated         # Playwright against a throw-away stack (see below)
```

First time only: `cd e2e && npx playwright install chromium`.
The e2e suite uses fake microphones and asserts real peer connections (open/close distances, zone walls, DND), gain values, knocks, forced kick, live map publish, nature-sound zones and every game table (poker, chess, Uno, Pok Deng, Bingo), keyboard use of the chess board, and the error boundaries.

**The e2e tests are destructive** (they reset the map to the seed and create users), so they never run against the stack people use. `pnpm e2e:isolated` builds a separate Compose project (`office3d-test`: its own database volume, `https://localhost:18443`, no TURN relay, values from `.env.test`), runs the suite and deletes the stack afterwards. `pnpm e2e:up` / `pnpm e2e:down` start and remove it by hand. `pnpm e2e` on its own refuses to start unless `E2E_ALLOW_DESTRUCTIVE=1` is set, which is only meant for a stack you can throw away.

## Known limits

* Frame rate on real phones and laptops has not been measured; see [DECISIONS.md](DECISIONS.md).
* iPhone and Safari/Firefox were not tested on real hardware.
* Login rate limits are kept in server memory, which is fine for a single server instance.
* Game tables are in memory and reset when the server restarts.

## More

* [DECISIONS.md](DECISIONS.md): every choice not fixed by the spec, and known gaps
* [SPEC-ZONES.md](SPEC-ZONES.md): zones, music, and game table rules
* [SPEC-AVATAR.md](SPEC-AVATAR.md): avatar design spec
* [ASSETS.md](ASSETS.md): 3D assets, fonts, licenses
* [docs/IT-GUIDE.th.md](docs/IT-GUIDE.th.md): HTTPS certificate guide for IT (Thai)
