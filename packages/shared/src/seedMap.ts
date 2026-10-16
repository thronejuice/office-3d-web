import { MapData, TILE } from './map';

/** Open plan (10 desks), two meeting rooms, a lounge, a nature-sound corner and a game area on a 40x28 grid. */
export function createSeedMap(): MapData {
  const w = 40, h = 28;
  const tiles = new Array(w * h).fill(TILE.FLOOR);
  const set = (x: number, y: number, t: number) => { tiles[y * w + x] = t; };
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0; x <= x1; x++) { set(x, y0, TILE.WALL); set(x, y1, TILE.WALL); }
    for (let y = y0; y <= y1; y++) { set(x0, y, TILE.WALL); set(x1, y, TILE.WALL); }
  };
  box(0, 0, w - 1, h - 1);
  box(26, 0, 38, 8); // meeting room 1
  box(26, 9, 38, 17); // meeting room 2
  for (let x = 1; x < w - 1; x++) set(x, 19, TILE.WALL); // lounge divider
  set(26, 4, TILE.DOOR); set(26, 13, TILE.DOOR); set(12, 19, TILE.DOOR); set(30, 19, TILE.DOOR);

  const furniture: MapData['furniture'] = [];
  const desks: MapData['desks'] = [];
  let n = 0;
  const add = (type: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) => furniture.push({ id: `f${++n}`, type, x, y, rot });

  for (let r = 0; r < 2; r++)
    for (let i = 0; i < 5; i++) {
      const x = 3 + i * 4, y = 3 + r * 4;
      add('desk', x, y);
      add('chairDesk', x, y + 1, 2); // chair models face +z at rot 0; this one sits south of the desk, so turn it towards it
      desks.push({ id: `d${desks.length + 1}`, x, y: y + 1, userId: null });
    }

  const zoneTiles = (x0: number, y0: number, x1: number, y1: number) => {
    const out: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * w + x);
    return out;
  };
  for (const [y0, y1] of [[1, 7], [10, 16]]) {
    const cy = Math.floor((y0 + y1) / 2);
    add('table', 30, cy);
    for (let x = 30; x < 33; x++) { add('chair', x, cy - 1); add('chair', x, cy + 1, 2); }
    add('pottedPlant', 37, y0);
    // TV on the east wall facing the table (rot 3 = towards -x), a speaker on each side
    add('cabinetTelevision', 37, cy - 1, 3); add('speaker', 37, cy - 2); add('speaker', 37, cy + 1);
  }

  // nature-sound corner (music zone) and game area (two poker tables) in the open space behind the desks
  add('bench', 3, 16); add('bench', 6, 16); add('pottedPlant', 2, 11); add('pottedPlant', 10, 11); add('pottedPlant', 2, 17); add('speaker', 10, 17);
  add('rugRectangle', 5, 13);
  // music corner: a jukebox and a few instruments
  add('poster', 1, 12, 1); add('painting', 1, 14, 1); add('poster', 1, 16, 1); // west wall
  add('jukebox', 10, 14, 3); add('piano', 3, 11); add('guitar', 7, 11); add('drums', 8, 12);
  add('gameTable', 16, 12); furniture[furniture.length - 1].game = 'poker';
  add('gameTable', 20, 12); furniture[furniture.length - 1].game = 'poker';
  add('chessTable', 14, 15); furniture[furniture.length - 1].game = 'chess';
  add('unoTable', 19, 15); furniture[furniture.length - 1].game = 'uno';
  add('pokdengTable', 22, 15); furniture[furniture.length - 1].game = 'pokdeng';
  add('bingoTable', 16, 15); furniture[furniture.length - 1].game = 'bingo';
  add('pottedPlant', 14, 9); add('pottedPlant', 24, 9); add('pottedPlant', 14, 17); add('pottedPlant', 24, 17);

  // lounge
  add('loungeSofa', 4, 22, 2); add('loungeSofa', 8, 22, 2); add('tableCoffee', 6, 24);
  add('loungeChair', 3, 25, 2); add('loungeChair', 10, 25, 2); add('rugRectangle', 5, 23);
  add('painting', 2, 20); add('painting', 9, 20); // views on the north wall; wall pictures sit on the floor tile beside the wall
  add('poster', 1, 22, 1); add('painting', 1, 24, 1); // ...and on the west wall (rot 1)
  add('bigTv', 5, 20); // on the north wall, facing the sofas (the default camera sees its screen from the front)
  add('pottedPlant', 1, 20); add('pottedPlant', 24, 20);
  add('bookcaseClosed', 14, 20); add('bookcaseClosed', 16, 20);
  for (let x = 28; x <= 33; x++) add('kitchenCabinet', x, 20);
  add('kitchenFridge', 34, 20); add('kitchenSink', 35, 20); add('kitchenCoffeeMachine', 36, 20);
  add('table', 28, 24); add('stoolBar', 28, 25); add('stoolBar', 30, 25);

  return {
    width: w,
    height: h,
    tiles,
    furniture,
    zones: [
      { id: 'room1', name: 'ห้องประชุม 1', color: '#3b82f6', kind: 'meeting', tiles: zoneTiles(27, 1, 37, 7) },
      { id: 'room2', name: 'ห้องประชุม 2', color: '#10b981', kind: 'meeting', tiles: zoneTiles(27, 10, 37, 16) },
      { id: 'music1', name: 'มุมฟังเสียงธรรมชาติ', color: '#22c55e', kind: 'music', track: 'forest', tiles: zoneTiles(2, 11, 10, 17) },
      { id: 'game1', name: 'โซนเกม', color: '#a855f7', kind: 'game', tiles: zoneTiles(14, 9, 24, 17) },
    ],
    desks,
    spawn: { x: 13, y: 18 },
  };
}
