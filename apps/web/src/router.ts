import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));
export function navigate(path: string) {
  history.pushState({}, '', path);
  listeners.forEach((l) => l());
}
export const usePath = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => void listeners.delete(cb); }, () => location.pathname);
