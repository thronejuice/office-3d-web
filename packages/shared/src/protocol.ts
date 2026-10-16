import type { AvatarConfig } from './avatar';
import type { Emote, Status } from './constants';
import type { MapData } from './map';
import type { PokerAction, PokerView } from './poker';
import type { ChessAction, ChessView } from './chess';
import type { UnoAction, UnoView } from './uno';
import type { PdAction, PdView } from './pokdeng';
import type { BingoAction, BingoView } from './bingo';

export type TableView = PokerView | ChessView | UnoView | PdView | BingoView;
export type GameAction = PokerAction | ChessAction | UnoAction | PdAction | BingoAction;

/** One game table as a particular viewer sees it. `view` is null when the table no longer exists. */
export interface GameState { tableId: string; view: TableView | null; deadline: number | null }

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  department: string;
  jobTitle: string;
  role: 'admin' | 'member';
}

/** What every client knows about a person in the office. */
export interface Presence {
  user: PublicUser;
  avatar: AvatarConfig;
  x: number;
  y: number;
  dir: number; // facing, radians
  status: Status;
  zone: string | null; // server-computed
  muted: boolean;
  raised: boolean;
}

export interface IceServer { urls: string | string[]; username?: string; credential?: string }

export interface MissedKnock { id: number; fromId: string; fromName: string; at: number }

export interface Welcome {
  selfId: string;
  map: MapData;
  mapVersion: number;
  people: Presence[];
  ice: IceServer[];
  missed: MissedKnock[];
}

export interface ServerToClient {
  welcome: (w: Welcome) => void;
  joined: (p: Presence) => void;
  left: (id: string) => void;
  moved: (m: { id: string; x: number; y: number; dir: number; zone: string | null }) => void;
  teleport: (m: { x: number; y: number; dir?: number }) => void; // authoritative correction for self
  status: (m: { id: string; status: Status }) => void;
  muted: (m: { id: string; muted: boolean }) => void;
  avatar: (m: { id: string; avatar: AvatarConfig }) => void;
  profile: (u: PublicUser) => void;
  emote: (m: { id: string; emote: Emote; at: number }) => void;
  raised: (m: { id: string; raised: boolean }) => void;
  knock: (m: { fromId: string; fromName: string; silent: boolean }) => void;
  map: (m: { map: MapData; version: number }) => void;
  signal: (m: { from: string; data: unknown }) => void;
  missed: (k: MissedKnock) => void;
  kicked: (reason: string) => void;
  game: (g: GameState) => void;
  gameError: (code: string) => void;
}

export interface ClientToServer {
  move: (m: { x: number; y: number; dir: number }) => void;
  setStatus: (s: Status) => void;
  setMuted: (m: boolean) => void;
  emote: (e: Emote) => void;
  raise: (on: boolean) => void;
  knock: (toId: string) => void;
  signal: (m: { to: string; data: unknown }) => void;
  clearMissed: () => void;
  gameSit: (tableId: string) => void;
  gameStand: () => void;
  gameAct: (a: GameAction) => void;
}
