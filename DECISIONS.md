# Decisions

Everything the product spec left open, plus deviations and known gaps.

## Deviations from the brief — read these first

* **Avatar:** Procedural Chibi character model (rounded low-poly) built purely from Three.js geometries (`SphereGeometry`, `CapsuleGeometry`, `TorusGeometry`, `CylinderGeometry`) with `MeshStandardMaterial` (`flatShading: false`, no toon, no outlines). All animations are 100% procedural: idle breathing, walk cycle (arm/leg swings + bounce), sit (hips lowered, legs bent forward), blink (randomized 120ms eye blink), speaking mouth animation, and procedural emote arm poses (wave, clap, raise hand, thumbs-up). The Kenney Blocky Characters model pack was completely removed.
* **`web` service** is a tiny Caddy container that only serves the static build; the public Caddy proxies to it. Matches the "caddy + web" layout of the brief.
* **ORM:** Drizzle (not Prisma) — no native engine binaries to ship; migrations are generated SQL in `apps/server/drizzle`.

## Not verified here (needs real hardware)

* The 30 fps budget on a mid-range phone and 60 fps on a laptop — measured nowhere (the dev machine renders in software). What is in place: instanced floors/walls/furniture (one draw call per furniture mesh type), blob shadows instead of shadow maps, DPR capped at 1.5 on touch devices, no per-frame React work (name tags are DOM nodes moved by `requestAnimationFrame`).
* The three-real-devices voice test incl. an iPhone. Done in automation only (Chromium, fake mics). iOS-specific handling is in place (explicit "เข้าออฟฟิศ" button runs `AudioContext.resume()` + `getUserMedia` inside the click) but untested on iOS.
* Safari/Firefox were not run. Output device picking (`setSinkId`) only appears where the browser supports it.
* Auto-away (tab hidden / 10 min idle) is implemented but has no automated test.

## Behaviour choices

**Auth**
* Sessions: random 32-byte token in an httpOnly, SameSite=Lax cookie (`Secure` in production), only its SHA-256 stored in Postgres; 7-day lifetime.
* Failed-login limit: 5 per username and 20 per IP per 15 minutes, kept in server memory (resets on restart; fine for one instance).
* Changing a password logs out the user's other sessions. An admin reset also ends all sessions and kicks the user from the office.
* Login screens say only "invalid username or password" (also for disabled accounts).
* Usernames are lower-case `a-z 0-9 . _ -`, 3–32 chars. Passwords ≥ 8 chars.
* One office connection per user: a second device entering kicks the first ("other_session").

**Voice**
* Whoever has the lexicographically smaller user id sends the WebRTC offer, so there is never offer glare. The receiving side counts an incoming connection as "already connected", so it applies the 9-tile threshold, not 7 (avoids flapping when two clients see slightly different positions).
* Connections are checked at 10 Hz from interpolated positions. Gain changes use `setTargetAtTime` (50 ms) to avoid clicks.
* A mic is optional: every connection negotiates a send-recv audio line, so a mic granted later is attached with `replaceTrack`.
* Without a usable mic the user is shown as muted.
* The speaking ring only appears for people you are connected to and can currently hear.
* Zone membership is computed by the server from the position and published map; clients compute their *own* zone with the same shared function so audio reacts instantly.
* DND: closes open-floor connections (no audio both ways); same-zone people still connect. Busy/Away do not touch audio.

**Presence**
* Auto-away only applies from Available/Busy and restores the previous status on activity. It never overrides Do Not Disturb (otherwise hiding the tab would silently re-enable audio).
* Raised hand is lowered by the server as soon as the user moves.
* Knocks need the target to be online. A knock to a DND user is delivered silently (toast, no sound) *and* stored in the `missed_knocks` table, so the list survives reconnects; "clear" deletes them.
* Spawn: assigned desk spot, else map spawn; if somebody stands there, the nearest free walkable tile (avoids stacking avatars).
* Movement validity on the server: target tile walkable and speed ≤ 7 tiles/s (client walks at 4.2) plus 2 tiles of slack per update for lag bursts; otherwise the client is teleported back.

**World**
* 1 tile = 1 world unit. Camera: orthographic, fixed at the (+x,+y) corner; WASD/joystick are screen-relative (W moves "up the screen", which is diagonal in tile space). Movement is continuous with per-axis collision (radius 0.3); A* is 8-neighbour without corner cutting.
* Furniture models are auto-fitted to their catalog footprint (and a height cap) at load time, so the catalog only declares footprint + whether it blocks. Rotation is in 90° steps around the footprint centre; anchor = top-left tile of the rotated footprint.
* Wall cut-away: walls within the screen-space band in front of the player are lowered (not hidden) so the room outline stays readable. Taller furniture does not cut away.
* Floors are a subtle checkerboard; meeting-room zones are tinted in the game view too.
* Time-limited TURN credentials (6 h, HMAC-SHA1 of `expiry:userId`) are generated by the server at connect time. coturn uses host networking and has no TLS (LAN only), UDP/TCP 3478, relay ports 49160–49200.

**Map editor**
* Draft is a single row (`map_draft`); publishing inserts a new row in `map_versions` and deletes the draft. Rollback re-publishes an old version as a *new* version (history is never rewritten) and is validated like any publish.
* Desk assignments are part of the map JSON, so they go live on publish.
* Draft saves validate the schema only; the reachability rules run on publish/rollback.
* Resizing crops or extends with empty tiles and drops furniture, desks and zone tiles that fall outside.
* Editor walls are drawn low so the inside can be edited; pan with right-mouse drag or WASD/arrows, zoom with the wheel (players can only zoom in steps and turn the view in 90° steps).
* Painting walls or void removes zone tiles and desk spots on that tile; furniture is not auto-removed (place/delete it explicitly).

**Desk owners (added later)**
* The admin assigns a desk spot to a user in the map editor (Desk tool). That user gets "แต่งโต๊ะของฉัน" in the ☰ menu and may place/move/rotate/delete furniture within `DESK_AREA.radius` (1 tile, so a 3×3 area) of their desk spot. Only furniture fully inside that area is theirs; everything else is locked. Radius and item cap are constants in `packages/shared/src/constants.ts`.
* Rules live in `applyDeskEdit` (shared, unit-tested) and are enforced by the server in `PUT /api/me/desk`: floor tiles only, no overlapping blocking pieces, and the whole map must still pass the publish validation (desk spots and spawn stay reachable).
* The edit is written into the *current* map version in place (no new version per tweak) and pushed live. If an admin later publishes a draft that was started before the edit, the edit is overwritten.
* Seed map: coffee machine moved so it no longer overlaps a kitchen cabinet.

**Misc**
* The route table is a 15-line history-API router; `/admin` and `/admin/map` are lazy-loaded.
* Caddy serves the CA at `/ca.crt` over **plain HTTP and HTTPS** so iOS/Android can fetch it before trusting HTTPS. Everything else on port 80 redirects to HTTPS.
* `window.__office3d` exposes read-only debug hooks (peer states, gains, positions, `walkTo`) used by the E2E tests.

* Camera zoom (changed from the original "no zoom" rule, at the product owner's request): three fixed steps (x0.75 / x1 / x1.4) via + / − buttons or the `+` / `-` keys, remembered in localStorage. The isometric angle can be turned in 90° steps (↻ / ↺ buttons or `E` / `Q`, smooth turn, remembered in localStorage); walking keys and the joystick follow the view, and the wall cut-away is computed for the turned camera. There is no free rotation and no pinch/wheel zoom, so the fps budget and touch controls (joystick, tap-to-walk) are unaffected.

## Zone kinds, nature sounds and game tables (SPEC-ZONES.md)

* A zone has one kind: `meeting` (default for old maps), `music` or `game`. The voice rules are identical for all kinds (same zone = full volume, different zone = silent), see `packages/shared/src/voice.ts`.
* Music zones play a looping nature track (`rain`, `forest`, `sea`, `stream`) only on the client of someone standing in the zone, fading in/out over 1.5 s through the voice AudioContext (so it starts from the "enter office" tap, as iOS requires). Volume and mute are per device (localStorage). Status (DND/away) does not affect it.
* Game tables are furniture of type `gameTable` with `game: 'poker'`. Seats are derived (`tableSeats`): one tile outside each long side, only walkable tiles, so a blocked seat simply disappears.
* Poker is Texas Hold'em, no-limit, fixed blinds, 2–6 players, implemented as a pure state machine in `packages/shared/src/poker.ts` and driven by `apps/server/src/games.ts` (timers, seating, per-viewer views). State lives in server memory only. Chips are play money (1,000 on sitting down). Hole cards are only ever sent to their owner (or at showdown).
* Seated players are teleported to the seat, face the table and cannot walk until they stand up (the server rejects `move`). Turn clock: 30 s, a timeout folds, two timeouts in a row stand the player up, leaving the office/disconnecting folds and frees the seat.
* All numbers (`POKER`, `MUSIC`, `SIT_DISTANCE`) are constants in `packages/shared`.

## Chess (round 2)

* Full rules in `packages/shared/src/chess.ts` (castling, en passant, promotion, check/checkmate/stalemate, draw by insufficient material, threefold repetition and the 50-move rule), verified with perft counts for the standard test positions. Promotion defaults to a queen when the client does not choose.
* The chess table is the `chessTable` furniture item (1x1) with `game: 'chess'`; its two seats are the tiles north and south of it. Seats at a table are fixed per game; the first game gives White to the first seat to sit, then colours swap every game while the same table stays occupied, and an empty table starts fresh.
* There is **no clock**: a player who walks away blocks the table until they stand up, which counts as resigning. Leaving the office or disconnecting does the same. A draw offer is declined by simply making a move, and a game ends with a result screen for 8 s before the next one starts by itself when both players are still seated.
* The board is clickable squares (buttons with Thai labels, e.g. "e2 เบี้ยขาว"); only the player to move receives legal moves from the server, and the server re-validates every move. Pieces are inline SVG drawn for this project.

## Uno (round 3)

* 108-card deck, 2-6 players, 7 cards each, the first card turned up is always a number card, the starting seat rotates every round. Engine: `packages/shared/src/uno.ts`.
* House rules for an office game: a wild draw-four can be played at any time (no challenge), no "UNO!" penalty (the table simply shows who has one card left), a card you draw may be played or kept (pass), with two players a reverse acts as a skip, and a deck that runs out is rebuilt from the discard pile.
* Turn clock 30 s like poker: a timeout draws a card and passes, two in a row stand the player up; their cards go back under the draw pile and if only one player remains they win. A round ends when someone empties their hand, shows the result for 8 s, then the next round starts by itself. People who sit down mid-round wait for the next one.
* The server sends each player only their own hand (other seats are card counts), and only the cards that are playable right now. Card faces are inline SVG; every colour also has its own shape so the game does not rely on colour alone.
* Seed map: the game area (x14-24, y9-17) now holds two poker tables, the chess table and one round Uno table (`unoTable`, 2x2, six seats).

## Pok Deng (round 4)

* Standard Thai rules with a rotating dealer: the first seat deals, then the role passes to the next occupied seat every round. Everybody else bets against the dealer. Engine: `packages/shared/src/pokdeng.ts`.
* Flow: betting (15 s, amounts 10 / 20 / 50 / 100, or all-in when a player has less than 10) -> two cards each -> a two-card total of 8 or 9 is a **pok** and is shown face up at once; a dealer pok ends the round immediately and nobody may draw -> punters in seat order, then the dealer, may draw a third card or stay (20 s each) -> all hands are shown and compared with the dealer.
* Hand ranking (strongest first): pok 9, pok 8, three of a kind, straight flush, straight, "sian" (three face cards that are not a run), then points 9..0. A–2–3 and Q–K–A are runs, K–A–2 is not. Equal strength is a tie and moves no chips. A run of J–Q–K counts as a straight.
* Multipliers (deng): two cards that are a pair or the same suit x2, three cards of one suit x3, straight x3, sian x3, straight flush x5, three of a kind x5. The winner's own hand decides the multiplier, and when the dealer wins, the dealer's hand does.
* Settlement: losing punters pay the dealer first (never more than their chips), then the dealer pays the winners in seat order only as far as the dealer's chips go. A player with 0 chips is removed before the next round.
* Clocks: a punter who does not bet in time bets the minimum, a player who does not act stays; two timeouts in a row stand the player up. A punter who leaves mid-round forfeits their bet to the dealer; a dealer who leaves cancels the round.
* Privacy: face-down cards are never sent to other players, only your own (and anybody's pok, and everything at showdown).
* The pok deng table is the `pokdengTable` furniture item (2x2, six seats).

## Bingo (round 5)

* Standard 75-ball bingo on a 5x5 card (B 1-15, I 16-30, N 31-45, G 46-60, O 61-75, free centre), 2-6 players on a round `bingoTable` (2x2, six seats). Engine: `packages/shared/src/bingo.ts`.
* **The server is the caller**: the first number comes 5 s after the round starts, then one every 6 s (`BINGO` in constants). Nobody has to host.
* Players mark called numbers themselves by tapping them (tap again to take a mark off); the server only lets you mark a number that was called and is on your card. A win is five marked squares in a row, column or diagonal, claimed with the "บิงโก!" button; the server re-checks the line against the called numbers. The claim button is only enabled when the card really has a line, so there is no penalty for a wrong claim because it cannot be sent from the UI.
* Everybody sees how many squares each player still needs ("เหลืออีก n") for some tension, but never their card or marks. The first valid claim wins the round. At the end the winner's card is shown with the winning line.
* A round with no winner (all 75 numbers called) or where everyone but one player has left is called off. People who sit down mid-round wait for the next one; each round deals new cards and starts by itself 9 s after the last.
* Marked squares are drawn with a check mark as well as a colour; called-but-unmarked numbers on your card pulse (no motion with `prefers-reduced-motion`).
