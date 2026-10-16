# Build: Office3D — a 3D virtual office with proximity voice (Gather-style)

You are building a new, standalone web app from an empty repository. Employees log in, appear as a low-poly 3D avatar in a shared isometric office, walk around, and talk by voice to whoever is near them, just like Gather.town but in 3D.

The decisions below were made by the product owner and are **fixed**. Do not change them. If one turns out to be technically impossible, stop and explain why before you switch to something else. Anything not specified here is your call: choose the simplest option that works and record it in `DECISIONS.md`.

---

## 1. Fixed decisions

| Topic | Decision |
|---|---|
| Product | Standalone app with **one office** for **one company**, internal use only |
| Scale | At most **~20 concurrent users** |
| Platforms | Desktop browsers **and mobile browsers** (Chrome, Edge, Safari incl. iOS Safari, Firefox) |
| Network | Reachable **only on the company LAN / VPN**, never from the public internet |
| Hosting | **Self-hosted** on a company server using **Docker Compose** |
| Stack | **TypeScript everywhere**: React + Three.js (React Three Fiber) frontend, Node.js backend, PostgreSQL |
| Communication | **Voice only.** No video, screen share or text chat |
| Voice model | **Proximity audio plus meeting-room zones** (details in §4) |
| Mic default | **Mic ON** when a user enters the office (they can mute) |
| Avatars | **Cute low-poly** style. User customizes parts: skin tone, hairstyle, hair color, top, bottom and their colors |
| Camera | **Isometric**, fixed angle, follows the player. No user rotation or zoom |
| Map | **One single map** (one floor), editable by admins in an in-app **Map Editor** |
| 3D assets | **Free CC0 assets only** (e.g. Kenney, Quaternius) |
| Auth | **Admins create username + password accounts.** No self-signup, no SSO |
| UI language | **Thai only** |
| HTTPS | The company has **no domain or certificate**. The app must provide HTTPS itself (§7) |

---

## 2. Tech stack

- **Monorepo** (pnpm workspaces): `apps/web`, `apps/server`, `packages/shared` (shared types, protocol messages, map schema, constants such as audio ranges).
- **Frontend:** Vite + React + TypeScript, `@react-three/fiber`, `@react-three/drei`. Keep UI state in a small store such as Zustand.
- **Backend:** Node.js (current LTS) + TypeScript, Fastify for HTTP, Socket.IO for realtime (presence, movement, WebRTC signaling, knocks, emotes).
- **Database:** PostgreSQL with Prisma (or Drizzle) and migrations.
- **Voice:** WebRTC **audio-only peer-to-peer mesh**. This is fine for ≤20 users on a LAN, so do not add an SFU. Include a **coturn** container as a fallback relay for VPN clients behind NAT.
- **Reverse proxy / TLS:** Caddy.
- **Nothing may load from the internet at runtime.** Ship every JS library, 3D model, texture, sound and font inside the images. Use a self-hosted Thai font, e.g. Noto Sans Thai or IBM Plex Sans Thai.

---

## 3. Users, auth, admin

### Roles
- `admin` and `member`. There can be several admins. An admin can promote or demote other users, but the last remaining admin cannot be demoted or disabled.

### Bootstrap
- On first start, create the initial admin from env vars (`INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`). This account must change its password on first login.

### Login
- Username + password. Hash passwords with argon2id. Use an httpOnly, Secure, SameSite=Lax session cookie stored server-side in Postgres.
- Rate-limit failed logins per username and per IP.
- **Forced password change on first login** and after an admin reset. Until the user changes it, every route except the change-password page is blocked.
- Users can change their own password at any time.

### Admin panel (`/admin`, admins only)
- Create a user: username, temporary password, display name, department, job title, role.
- Edit display name, department, title and role.
- **Reset password.** Sets a new temporary password and forces a change on next login.
- **Disable / enable account.** Disabling immediately ends the user's sessions and **kicks them from the office in real time**: their socket is closed and their avatar disappears for everyone.
- Display name, department and title appear in the online list and in the name tag/hover card above the avatar.

---

## 4. Voice: exact behavior

All distances are in **tiles**. Put every number in `packages/shared` constants so they can be tuned in one place.

### Proximity (open floor)
- Volume depends on the distance between two avatars:
  - `d ≤ 2` → full volume (gain 1.0)
  - `2 < d < 6` → linear falloff to 0
  - `d ≥ 6` → silent
- Open a WebRTC peer connection when two users come within **7 tiles**. Close it when they move beyond **9 tiles**. The gap between the two numbers (hysteresis) stops connections from flapping.
- Apply per-peer volume with the Web Audio API (`MediaStreamAudioSourceNode → GainNode → destination`) and update it every frame or at ≥10 Hz from interpolated positions.
- **Known gotcha:** in Chromium, a remote WebRTC stream produces no Web Audio output unless the stream is also attached to a (muted) `<audio>` element. Handle this.
- **Known gotcha:** iOS Safari requires `AudioContext.resume()` and `getUserMedia` to run inside a user gesture. The office-entry screen must have an explicit "เข้าออฟฟิศ" (enter) button for this reason.

### Meeting-room zones
- A zone is a set of tiles defined in the Map Editor (§6).
- Users **inside the same zone** hear each other at **full volume**, regardless of distance, while they stay in the zone.
- Users **outside** the zone cannot hear anyone inside, and people inside cannot hear anyone outside, even when they are close to each other across the wall.
- Peer connection rule: users in the same zone are always connected; users in different zones, or one in a zone and one outside, are never connected.

### Status interaction
- **Do Not Disturb (ห้ามรบกวน):** no audio in either direction with anyone, **except** people in the same meeting zone, who are heard normally. Knocks still arrive but **without sound**; they go into a "missed knocks" list the user can open later.
- **Busy (ไม่ว่าง):** a label only. Audio works normally.
- **Away (ไม่อยู่ที่โต๊ะ):** set automatically when the tab is hidden or there is no input for **10 minutes**, and cleared automatically on the next input or when the tab becomes visible. The avatar is drawn semi-transparent / dimmed. Audio rules do not change.
- **Available (ว่าง):** the default.

### UI
- Mute toggle with a keyboard shortcut (`M`) and a mobile button. Show a muted-mic icon above muted users.
- **Speaking indicator:** a ring or glow on an avatar while that user is talking, detected locally with an `AnalyserNode` on each stream.
- Mic permission denied → show a clear Thai message explaining how to allow it. The user can still walk around without a mic.
- Device picker for microphone and output where the browser supports it.

---

## 5. The 3D office

### Rendering
- An isometric orthographic camera follows the local avatar smoothly.
- Tile-based world. Floors, walls and doors come from the map data. Furniture comes from a catalog of CC0 models.
- Performance budget: **60 fps** on a mid-range laptop, **≥30 fps** on a mid-range phone with 20 avatars visible. Use instancing for repeated furniture, cap the device pixel ratio on mobile, and use simple lighting with baked or limited shadows.
- Walls between the camera and the player fade or cut away so the player is never hidden.

### Avatars
- Use a CC0 low-poly character set that has a rig and animations: idle, walk, wave, clap, raise hand, thumbs up. Quaternius character packs fit this. Verify the license yourself.
- Build the customizer from that pack's interchangeable parts and color tints: skin tone, hairstyle, hair color, top, top color, bottom, bottom color. Store the result as a small JSON object on the user record.
- On first entry, the user must open the customizer. They can reopen it later from the menu.
- Name tag above the head shows the display name and a status dot. Tapping or hovering an avatar shows a card with name, department, title, status, and buttons for "เดินไปหา" (walk to) and "เคาะเรียก" (knock).

### Movement
- **Desktop:** WASD / arrow keys, **or** click a floor tile to walk there.
- **Mobile:** an on-screen virtual joystick, **or** tap a floor tile to walk there.
- Movement is blocked by walls and furniture. Use A* pathfinding on the tile grid for click/tap-to-move and for walk-to-friend.
- Each client sends its position and facing at ~10 Hz. The server checks that the position is on a walkable tile and that the movement speed is plausible, then broadcasts it. Other clients interpolate remote avatars smoothly.
- **Spawn:** at the user's **assigned desk** if one exists, otherwise at the map's default spawn point.

### Social features
- **Online list** panel: everyone currently in the office, with avatar color, name, department, title and status. It can be sorted or filtered by name. Users can set their own status here.
- **Walk to friend:** clicking a name in the list (or "เดินไปหา" on the hover card) makes the local avatar pathfind to a free tile next to that person. Any manual movement cancels it.
- **Knock (เคาะเรียก):** the recipient gets a toast "<name> เคาะเรียกคุณ" with a "ไปหา" button that walks them to the knocker, plus a short knock sound. If the recipient is DND, the knock is silent and goes into the missed list. Rate-limit knocks to one per sender→recipient pair every 10 s.
- **Emotes:** wave, clap and thumbs-up play an animation once and show an icon bubble over the head for ~4 s. **Raise hand** is a toggle that stays up until it is lowered or the user moves. Emotes are available from a small emote bar and from number keys `1–4` on desktop.

---

## 6. Map Editor (`/admin/map`, admins only)

- The editor uses the same isometric 3D view with a visible grid. It may also offer an optional top-down view.
- Tools:
  1. **Floor / wall painting** on the grid: floor tiles, walls, doors, and an eraser. The map size can be set, e.g. up to 80×80 tiles.
  2. **Furniture placement** from a catalog of CC0 models (Kenney Furniture Kit or similar): place, move, rotate in 90° steps, delete. Each catalog item declares its footprint in tiles and whether it blocks movement.
  3. **Meeting-room zones:** paint tiles into a named zone (e.g. "ห้องประชุม 1") and show each zone as a colored overlay.
  4. **Desk assignment:** mark a tile next to a desk as a desk spot and assign it to a user from a dropdown. Each user has at most one desk and each desk spot at most one user.
  5. **Default spawn point.**
- Save as a **draft**, then **Publish**. Publishing stores a new version of the map JSON in Postgres and pushes it live to every connected client without a page reload. A user who ends up on a tile that is no longer walkable is moved to the nearest walkable tile.
- Keep previous versions and allow a rollback to any of them.
- Validate before publishing: the spawn point and every desk spot must be walkable and reachable from the spawn point.
- Ship a ready-to-use **seed map** with an open-plan area, about 20 desks, 2 meeting rooms and a lounge, so the app is usable before anyone edits the map.
- Define the map JSON schema once in `packages/shared` and validate it with Zod on the server.

---

## 7. Deployment & HTTPS

- `docker compose up -d` brings up everything: `caddy`, `web` (static build served by Caddy or the server), `server`, `postgres`, `coturn`.
- **HTTPS without a public domain.** Browsers allow microphone access only on HTTPS.
  - Caddy uses `tls internal` and serves on a configurable hostname or IP (`OFFICE_HOST`, e.g. `office.local` or `10.0.0.5`).
  - Expose the Caddy root CA certificate for download and write **step-by-step Thai instructions** for IT: how to install and trust it on Windows, macOS, Android and **iOS** (iOS needs both profile install **and** "Certificate Trust Settings" enabled), and how to add a DNS entry or hosts-file line for the hostname.
  - Make it a single config switch to use a real certificate instead (`TLS_CERT_FILE` / `TLS_KEY_FILE`) if IT provides one later.
- coturn: listens on the server's LAN IP, uses time-limited credentials generated by the server (shared secret). The server hands ICE servers to clients.
- All configuration goes in one `.env` file, with a documented `.env.example`.
- Back up Postgres with a documented one-line command.

---

## 8. Thai UI

- All user-facing text is Thai. Put every string in one file (`apps/web/src/strings.th.ts`) rather than scattering literals through components. Do not add an i18n framework.
- Status labels: ว่าง / ไม่ว่าง / ห้ามรบกวน / ไม่อยู่ที่โต๊ะ.
- Responsive layout: on phones, panels such as the online list and the emote bar become bottom sheets or drawers and never cover the joystick.

---

## 9. Out of scope (do not build)

Video, screen sharing, text chat, multiple offices or tenants, multiple floors or maps, call recording, SSO / Google / Microsoft login, self-signup, public-internet access, native mobile apps, user-uploaded avatars or furniture.

---

## 10. Milestones and acceptance criteria

Build in this order. Finish each milestone, run its checks, and fix failures before moving on.

1. **Skeleton & deploy.** Monorepo, Docker Compose, Caddy HTTPS with internal CA, Postgres, health endpoint.
   ✅ `docker compose up -d` on a clean machine serves the app over HTTPS at `OFFICE_HOST`.
2. **Auth & admin users.** Bootstrap admin, login, forced password change, admin CRUD, reset, disable, roles.
   ✅ A disabled user's open session is kicked within 2 s.
3. **3D office (single player).** Seed map rendering, avatar customizer, keyboard / click / joystick / tap movement, A* pathfinding, collisions, isometric camera, wall fading.
   ✅ Meets the fps budget in §5 on a mid-range phone.
4. **Multiplayer presence.** Socket.IO rooms, position sync and interpolation, name tags, online list, statuses including auto-away, walk-to-friend, knocks, emotes.
   ✅ Two browsers see each other move smoothly. A knock on a DND user is silent and appears in the missed list.
5. **Proximity voice.** WebRTC mesh, signaling, coturn, connect/disconnect hysteresis, distance-based gain, meeting zones, DND rules, mute, speaking indicator, mic-denied state.
   ✅ All §4 rules hold in an automated test (below) and in a manual test with 3 real devices including one iPhone.
6. **Map Editor.** All five tools, draft/publish, live push, version history and rollback, validation.
   ✅ Publishing a new wall live moves any user standing inside it to a walkable tile.
7. **Hardening & docs.** README (setup, env, backup), Thai IT guide for certificate install, `DECISIONS.md`, `ASSETS.md` (every asset with source URL and license).

### Tests (required)
- Unit tests (Vitest): gain-by-distance function, zone audibility rules incl. DND, connect/disconnect hysteresis, A* pathfinding, map schema validation, map publish validation, auth (hashing, forced change, disabled user).
- E2E (Playwright): two or three browser contexts with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`. Assert peer connections open and close at the right distances and zone boundaries, gain values on the client, knock/DND behavior, and that a disabled user gets kicked.
- Keep pure logic (audibility, gain, pathfinding) in `packages/shared` as plain functions so it is easy to test.

---

## 11. Working rules

- Keep it simple. This is a 20-person internal tool, so add no microservices, queues, Redis or SFU unless a requirement above cannot be met without them.
- Treat the server as authoritative for identity, status, zone membership and map data. Clients are trusted only for their own position, within the server's walkability and speed checks.
- Never commit secrets. Every secret goes in `.env`.
- When a requirement is ambiguous, pick the option closest to how Gather.town behaves and log it in `DECISIONS.md`.
