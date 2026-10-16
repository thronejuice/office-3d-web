import type { MapData } from '@office3d/shared';

/** What the HTTP layer needs from the realtime layer. */
export interface Hub {
  kick(userId: string, reason: string): void;
  profileChanged(userId: string): Promise<void>;
  mapPublished(map: MapData, version: number): void;
}
export const nullHub: Hub = { kick() {}, async profileChanged() {}, mapPublished() {} };
