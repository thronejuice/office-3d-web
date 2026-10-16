import { TV_H, TV_SCENES, TV_W } from './tvScenes';

/** Pictures for the wall: a view (one of the TV landscapes) and music posters, all drawn from code. */
export const POSTER_W = 256;
export const POSTER_H = 360;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;

const title = (c: Ctx, text: string, y: number, color = '#fff') => {
  c.fillStyle = color;
  c.font = '700 40px sans-serif';
  c.textAlign = 'center';
  c.fillText(text, POSTER_W / 2, y);
};
const disc = (c: Ctx, x: number, y: number, r: number, fill: string) => {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};
const bg = (c: Ctx, a: string, b: string) => {
  const g = c.createLinearGradient(0, 0, 0, POSTER_H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(0, 0, POSTER_W, POSTER_H);
};

const vinyl = (c: Ctx, rnd: Rnd) => {
  const h = Math.floor(rnd() * 360);
  bg(c, `hsl(${h},70%,30%)`, `hsl(${(h + 40) % 360},70%,55%)`);
  disc(c, 128, 150, 100, '#15151a');
  c.strokeStyle = '#2a2a33';
  c.lineWidth = 1;
  for (let r = 40; r < 98; r += 8) { c.beginPath(); c.arc(128, 150, r, 0, Math.PI * 2); c.stroke(); }
  disc(c, 128, 150, 34, `hsl(${(h + 180) % 360},80%,60%)`);
  disc(c, 128, 150, 5, '#15151a');
  title(c, 'MUSIC', 322);
};

const notes = (c: Ctx, rnd: Rnd) => {
  bg(c, '#1e1b4b', '#4c1d95');
  c.strokeStyle = '#fff';
  c.fillStyle = '#fff';
  c.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const x = 40 + rnd() * 170, y = 60 + rnd() * 190, hue = Math.floor(rnd() * 360);
    c.strokeStyle = c.fillStyle = `hsl(${hue},85%,70%)`;
    disc(c, x, y, 13, c.fillStyle as string);
    c.beginPath(); c.moveTo(x + 12, y); c.lineTo(x + 12, y - 62); c.lineTo(x + 34, y - 48); c.stroke(); // stem and flag
  }
  title(c, 'LIVE', 322);
};

const retro = (c: Ctx) => {
  bg(c, '#fb7185', '#fde68a');
  disc(c, 128, 150, 85, '#7c2d5a');
  c.fillStyle = '#fb7185'; // stripes cut into the sun
  for (let y = 170, h = 4; y < 235; y += 12, h += 1.5) c.fillRect(30, y, 200, h);
  c.fillStyle = '#4c1d3d';
  c.fillRect(0, 235, POSTER_W, 125);
  title(c, 'CHILL', 322, '#fde68a');
};

const shapes = (c: Ctx, rnd: Rnd) => {
  bg(c, '#f8fafc', '#e2e8f0');
  for (let i = 0; i < 7; i++) {
    c.globalAlpha = 0.85;
    c.fillStyle = `hsl(${Math.floor(rnd() * 360)},75%,60%)`;
    if (i % 2) disc(c, 30 + rnd() * 200, 30 + rnd() * 240, 24 + rnd() * 40, c.fillStyle as string);
    else c.fillRect(20 + rnd() * 150, 20 + rnd() * 220, 40 + rnd() * 70, 40 + rnd() * 70);
  }
  c.globalAlpha = 1;
  title(c, 'JAZZ', 322, '#1e293b');
};

export const POSTERS: ((c: Ctx, rnd: Rnd) => void)[] = [vinyl, notes, retro, shapes];
export const paintPoster = (c: Ctx, rnd: Rnd) => POSTERS[Math.floor(rnd() * POSTERS.length)](c, rnd);
export const paintView = (c: Ctx, rnd: Rnd) => TV_SCENES[Math.floor(rnd() * TV_SCENES.length)](c, rnd);
export const VIEW_SIZE = { w: TV_W, h: TV_H };
