export interface CatalogItem {
  id: string;
  name: string; // Thai label for the editor
  model: string; // file under /models/furniture/ ('' when procedural)
  procedural?: boolean; // no GLB: the web app builds it from primitives (game/Procedural.tsx)
  w: number; // footprint in tiles at rotation 0
  h: number;
  blocks: boolean;
}

const item = (id: string, name: string, w: number, h: number, blocks = true, model = `${id}.glb`): CatalogItem => ({
  id,
  name,
  model,
  w,
  h,
  blocks,
});

const proc = (id: string, name: string, w: number, h: number, blocks = true): CatalogItem => ({ id, name, model: '', w, h, blocks, procedural: true });

export const CATALOG: CatalogItem[] = [
  item('desk', 'โต๊ะทำงาน', 2, 1),
  item('deskCorner', 'โต๊ะมุม', 2, 2),
  item('chairDesk', 'เก้าอี้ทำงาน', 1, 1, false),
  item('computerScreen', 'จอคอมพิวเตอร์', 1, 1, false),
  item('laptop', 'แล็ปท็อป', 1, 1, false),
  item('table', 'โต๊ะประชุม', 3, 1),
  item('gameTable', 'โต๊ะเกม', 3, 1, true, 'table.glb'), // seats are derived, see game.ts
  item('chessTable', 'โต๊ะหมากรุก', 1, 1, true, 'sideTable.glb'), // two seats facing each other, see game.ts
  item('unoTable', 'โต๊ะยูโน', 2, 2, true, 'tableRound.glb'), // six seats around it, see game.ts
  item('pokdengTable', 'โต๊ะป๊อกเด้ง', 2, 2, true, 'tableRound.glb'), // six seats around it, see game.ts
  item('bingoTable', 'โต๊ะบิงโก', 2, 2, true, 'tableRound.glb'), // six seats around it, see game.ts
  item('tableRound', 'โต๊ะกลม', 2, 2),
  item('tableCoffee', 'โต๊ะกาแฟ', 2, 1),
  item('chair', 'เก้าอี้', 1, 1, false),
  item('loungeSofa', 'โซฟา', 2, 1, false), // walk-on so avatars can sit on it, see seat.ts
  item('loungeSofaLong', 'โซฟายาว', 2, 2, false), // walk-on so avatars can sit on it, see seat.ts
  item('loungeChair', 'เก้าอี้โซฟา', 1, 1, false), // walk-on so avatars can sit on it, see seat.ts
  item('bench', 'ม้านั่ง', 2, 1, false), // walk-on so avatars can sit on it, see seat.ts
  item('stoolBar', 'สตูลบาร์', 1, 1),
  item('bookcaseClosed', 'ตู้หนังสือ', 2, 1),
  item('cabinetTelevision', 'ตู้ทีวี', 2, 1),
  item('televisionModern', 'ทีวี', 1, 1, false),
  item('sideTable', 'โต๊ะข้าง', 1, 1),
  item('kitchenFridge', 'ตู้เย็น', 1, 1),
  item('kitchenCabinet', 'ตู้ครัว', 1, 1),
  item('kitchenSink', 'อ่างล้างจาน', 1, 1),
  item('kitchenCoffeeMachine', 'เครื่องชงกาแฟ', 1, 1),
  item('pottedPlant', 'ต้นไม้กระถาง', 1, 1),
  item('plantSmall1', 'ต้นไม้เล็ก', 1, 1, false),
  item('lampRoundFloor', 'โคมไฟตั้งพื้น', 1, 1),
  item('coatRack', 'ราวแขวนเสื้อ', 1, 1),
  item('trashcan', 'ถังขยะ', 1, 1, false),
  item('speaker', 'ลำโพง', 1, 1),
  item('rugRectangle', 'พรม', 3, 2, false),
  proc('jukebox', 'เครื่องเล่นเพลง', 1, 1),
  proc('piano', 'เปียโน', 2, 1),
  proc('guitar', 'กีตาร์', 1, 1),
  proc('drums', 'กลองชุด', 2, 2),
  proc('bigTv', 'ทีวีจอใหญ่', 3, 1), // shows a changing picture, see game/tvScenes.ts
  // wall hangings: stand on the floor tile next to a wall, glued to the tile's back edge (rot 0: wall to the north, rot 1: wall to the west)
  proc('painting', 'ภาพวิว', 2, 1, false),
  proc('poster', 'โปสเตอร์', 1, 1, false),
];

export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
