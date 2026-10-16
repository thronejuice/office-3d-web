# Assets and licenses

Nothing is loaded from the internet at runtime: all files below ship inside the `web` image.

## 3D assets (CC0)

| Asset | Used for | Source | License | Location |
|---|---|---|---|---|
| Kenney **Furniture Kit** (29 of its models: desk, chairs, sofas, tables, kitchen, plants, shelves…) | Furniture catalog | https://kenney.nl/assets/furniture-kit | CC0 1.0 | `apps/web/public/models/furniture/*.glb`, license text `LICENSE-kenney-furniture-kit.txt` |

Avatars are 100% procedural (rounded low-poly chibi style) created purely from Three.js geometries (`SphereGeometry`, `CapsuleGeometry`, `TorusGeometry`, `CylinderGeometry`) in `apps/web/src/game/Avatar.tsx`. No external 3D character model or texture file is used. Idle, walk, sit, blink, speaking mouth, and emotes (wave / clap / raise-hand / thumbs-up) are all procedural. Walls and floors are procedural boxes. The knock sound is synthesized with Web Audio. No other 3D model, texture or sound is used.

## Nature sounds (music zones) — `apps/web/public/audio/nature/`

All sources are **CC0** (public domain dedication); attribution is not required but is given here. Every file was trimmed, loudness-normalised and cross-faded into a seamless loop, then encoded as 96 kbps MP3 (so the files are derived works, not the originals).

| File | Source | Author | License |
|---|---|---|---|
| `rain.mp3` | "Rain (loopable)" clips 1 and 2 — https://opengameart.org/content/rain-loopable | Ylmir | CC0 1.0 |
| `forest.mp3` | "Birds and Wind - Ambient" (`Birds and Wind - Ambient.ogg`) — https://opengameart.org/content/birds-and-wind-ambient-birds-wind-and-synth | Spring Spring | CC0 1.0 |
| `sea.mp3` | "Beach Ocean Waves" (four wave clips, original https://www.freesound.org/people/jasinski/sounds/18363/) — https://opengameart.org/content/beach-ocean-waves | jasinski (submitted by qubodup) | CC0 1.0 |
| `stream.mp3` | "Sea and river wave sounds" (`VistulaShort.mp3`, first 60 s, river recording) — https://opengameart.org/content/sea-and-river-wave-sounds | RandomMind | CC0 1.0 |

Licenses were read from each OpenGameArt page on 2026-10-15. The audio itself has not been listened to by the person who prepared it: check the sound quality before relying on it, and swap a file in the same folder (same name) if one is not good enough.

Playing cards, chips and every game icon are drawn as inline SVG in the app (`ui/Cards.tsx`); no image files are used.

## Fonts

| Font | Source | License |
|---|---|---|
| Noto Sans Thai (via `@fontsource/noto-sans-thai`, bundled by Vite into `assets/`) | https://fonts.google.com/noto/specimen/Noto+Sans+Thai | SIL Open Font License 1.1 |

Emoji icons (🎤 🔇 👋 👏 👍 ✋ …) are drawn by the operating system's own emoji font; nothing is downloaded.

## Main libraries (MIT unless noted)

react, react-dom, three, @react-three/fiber, @react-three/drei, zustand, socket.io(-client), fastify, @fastify/cookie, drizzle-orm, pg, argon2, zod, vite, vitest, Playwright (Apache-2.0). Docker images: caddy (Apache-2.0), postgres (PostgreSQL License), coturn (BSD).
