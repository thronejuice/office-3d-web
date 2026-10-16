// All tunable numbers live here. Distances are in tiles.
export const AUDIO = {
  fullVolumeDistance: 2, // d <= this -> gain 1
  silentDistance: 6, // d >= this -> gain 0
  connectDistance: 7, // open a peer connection within this
  disconnectDistance: 9, // close it beyond this (hysteresis)
} as const;

export const MOVE = {
  speed: 4.2, // tiles / second (client)
  maxServerSpeed: 7, // tiles / second the server tolerates
  speedSlack: 2, // extra tiles of tolerance per update (lag bursts)
  sendHz: 10,
  radius: 0.3, // collision radius in tiles
} as const;

export const MAP_LIMITS = { maxSize: 80, minSize: 8 } as const;

export const AWAY_AFTER_MS = 10 * 60 * 1000;
export const KNOCK_COOLDOWN_MS = 10_000;
export const EMOTE_DURATION_MS = 4000;

export const AUTH = {
  sessionDays: 7,
  maxFailsPerUser: 5,
  maxFailsPerIp: 20,
  lockWindowMs: 15 * 60 * 1000,
  minPasswordLength: 8,
} as const;

export const STATUSES = ['available', 'busy', 'dnd', 'away'] as const;
export type Status = (typeof STATUSES)[number];

export const EMOTES = ['wave', 'clap', 'thumbsup', 'raisehand'] as const;
export type Emote = (typeof EMOTES)[number];

/** A desk owner may rearrange furniture within this Chebyshev radius of their desk spot. */
export const DESK_AREA = { radius: 1, maxItems: 30 } as const;

/** Texas Hold'em table rules. Chips are play money only. */
export const POKER = {
  startChips: 1000,
  smallBlind: 10,
  bigBlind: 20,
  turnMs: 30_000,
  maxSeats: 6,
  minPlayers: 2,
  maxTimeouts: 2, // timeouts in a row before the player is stood up
  nextHandMs: 5000,
} as const;

export const ZONE_KINDS = ['meeting', 'music', 'game'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];
export const MUSIC_TRACKS = ['rain', 'forest', 'sea', 'stream'] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];
export const GAMES = ['poker', 'chess', 'uno', 'pokdeng', 'bingo'] as const;
export type GameId = (typeof GAMES)[number];

/** Chess has no clock: a player who walks away forfeits by standing up. */
export const CHESS = { nextGameMs: 8000 } as const;

/** Uno table rules. */
export const UNO = { maxSeats: 6, minPlayers: 2, handSize: 7, turnMs: 30_000, maxTimeouts: 2, nextRoundMs: 8000 } as const;

/** Pok Deng table rules. Chips are play money. */
export const POKDENG = { maxSeats: 6, minPlayers: 2, startChips: 1000, bets: [10, 20, 50, 100], betMs: 15_000, actMs: 20_000, nextRoundMs: 7000, maxTimeouts: 2 } as const;

/** Bingo table rules: the server calls a number every `callMs`. */
export const BINGO = { maxSeats: 6, minPlayers: 2, firstCallMs: 5000, callMs: 6000, nextRoundMs: 9000 } as const;
