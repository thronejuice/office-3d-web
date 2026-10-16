# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Employees of one company (at most ~20 online at once), on the company LAN or VPN, using desktop and mobile browsers (Chrome, Edge, Safari including iOS, Firefox). They keep the office open while they work, so they can talk by voice with whoever is nearby. A small group of admins creates accounts, resets passwords, disables users and edits the office map.

## Product Purpose
Office3D is a self-hosted virtual office in the spirit of Gather.town, in 3D. People log in, appear as a low-poly avatar in a shared isometric office, walk around, and talk to whoever is near them. Success: a colleague can find, approach and talk to another person as easily as in a real office, with no setup beyond opening a page and allowing the microphone.

## Positioning
Internal, self-hosted, voice-only. Nothing loads from the internet, no video, screen share or text chat, one office for one company. Proximity audio plus meeting-room zones decide who can hear whom.

## Operating Context
- Served over HTTPS by the app's own Caddy internal CA, because the company has no domain or certificate. Each device must trust that CA once (docs/IT-GUIDE.th.md).
- Single map (one floor), edited by admins in an in-app Map Editor with draft, publish and rollback; publishing pushes live to everyone.
- Accounts are created by admins (username + password); no self-signup or SSO. First login forces a password change.
- Statuses: available, busy, do-not-disturb, away (automatic after 10 minutes idle or hidden tab).

## Capabilities and Constraints
- UI language is Thai only; every string lives in `apps/web/src/strings.th.ts`; no i18n framework.
- Isometric fixed camera that follows the player; no user rotation or zoom of the scene.
- Movement: WASD/arrows or click/tap a tile on desktop, on-screen joystick or tap on mobile, with A* pathfinding.
- Voice: WebRTC audio-only mesh, mic on by default with mute (key `M`), speaking indicator, device picker. Mic denied must still allow walking.
- Social: online list, walk to person, knock (silent and listed as missed when DND), emotes (wave, clap, thumbs up, raise hand).
- Avatars: low-poly, customizable skin, hair style/color, top, bottom and colors. 3D assets are CC0 only.
- Performance budget: 60 fps on a mid-range laptop, 30 fps or better on a mid-range phone with 20 avatars.
- Panels on phones become bottom sheets or drawers and must never cover the joystick.

## Brand Commitments
None beyond the name "Office3D" and the current Thai copy in `strings.th.ts`. No company logo or brand voice has been supplied.

## Evidence on Hand
Seed map, procedural chibi avatars, Kenney CC0 furniture models (`public/models/furniture`, licenses in ASSETS.md), the Thai IT guide, and an e2e suite covering voice, DND, zones, knocks, kick and map publish. No customer quotes, benchmarks or usage data exist; do not invent them.

## Product Principles
1. Presence first: seeing and hearing the right people at the right distance matters more than any decoration.
2. Voice-only and quiet by default; nothing should demand attention unless someone is reaching out to you.
3. Works on a phone as well as a laptop, with controls that never fight the scene.
4. Self-contained: no runtime dependency on the internet.
5. Simple enough for a 20-person team: no feature that needs an admin to babysit it.

## Accessibility & Inclusion
Keyboard operation of all panels, dialogs and menus; status never conveyed by color alone; text contrast at least 4.5:1 in light and dark; touch targets at least 44px; pinch zoom allowed. Thai text must render with the bundled Noto Sans Thai.
