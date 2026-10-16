import { useStore } from '../store';

let timer: ReturnType<typeof setTimeout> | undefined;
/** Hover with a short grace period so the pointer can travel from the avatar to its card. */
export function hoverAvatar(id: string, on: boolean) {
  clearTimeout(timer);
  if (on) useStore.getState().set({ hoverId: id });
  else timer = setTimeout(() => useStore.getState().set({ hoverId: null }), 350);
}
export const keepHover = (id: string) => { clearTimeout(timer); useStore.getState().set({ hoverId: id }); };
