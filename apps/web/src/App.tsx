import { Suspense, lazy, useEffect } from 'react';
import { useStore } from './store';
import { T } from './strings.th';
import { usePath } from './router';
import { ChangePassword, Login, refreshMe } from './pages/Auth';
import { Lobby } from './pages/Lobby';
import { OfficeCanvas } from './game/Scene';
import { Hud, useOfficeInput } from './ui/Hud';
import { Overlay } from './ui/Overlay';
import { voice } from './game/voice';
import { live } from './game/live';
import { deskEditClick } from './game/deskEdit';

const Admin = lazy(() => import('./pages/Admin'));
const MapEditor = lazy(() => import('./pages/MapEditor'));
const Versions = lazy(() => import('./pages/Versions'));

function Office() {
  useOfficeInput();
  useEffect(() => {
    (window as any).__office3d = {
      voice: () => voice.debug(),
      self: live.self,
      others: () => [...live.others].map(([id, o]) => ({ id, x: o.x, y: o.y, zone: o.zone })),
      walkTo: async (x: number, y: number) => (await import('./game/Scene')).walkToPoint(x, y, live.map!),
      state: () => useStore.getState(),
      seated: () => live.seated,
      // test hook: feed the table panel a broken state to check that the error boundary contains it
      breakGame: (id: string) => useStore.setState((s) => ({ games: { ...s.games, [id]: { tableId: id, deadline: null, view: { game: 'poker', phase: 'preflop', seats: [], board: null, pot: 0, toAct: -1, currentBet: 0, minRaise: 0, button: 0, handNo: 1, result: null } as never } } })),
      breakApp: (id: string) => useStore.setState((s) => ({ games: { ...s.games, [id]: { tableId: id, deadline: null, view: { game: 'poker', seats: null } as never } } })),
      deskClick: (x: number, y: number) => deskEditClick.handler?.(x, y),
    };
  }, []);
  return (
    <div className="office">
      <OfficeCanvas />
      <Overlay />
      <Hud />
    </div>
  );
}

export function App() {
  const me = useStore((s) => s.me);
  const authReady = useStore((s) => s.authReady);
  const inOffice = useStore((s) => s.inOffice);
  const path = usePath();
  useEffect(() => void refreshMe(), []);
  if (!authReady) return <div className="center-page">{T.loading}</div>;
  if (!me) return <Login />;
  if (me.mustChangePassword) return <ChangePassword forced />;
  if (inOffice) return <Office />;
  if (me.role === 'admin' && path === '/admin') return <Suspense fallback={T.loading}><Admin /></Suspense>;
  if (me.role === 'admin' && path === '/admin/map') return <Suspense fallback={T.loading}><MapEditor /></Suspense>;
  if (me.role === 'admin' && path === '/admin/versions') return <Suspense fallback={T.loading}><Versions /></Suspense>;
  return <Lobby />;
}
