/** Pictures for the lounge TV, drawn from code (nothing is downloaded and no image files ship). Each scene is random in its details. */
export const TV_W = 512;
export const TV_H = 288;

type Rnd = () => number;
type Ctx = CanvasRenderingContext2D;

function gradient(c: Ctx, y0: number, y1: number, stops: string[]) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  c.fillStyle = g;
  c.fillRect(0, y0, TV_W, y1 - y0);
}
function disc(c: Ctx, x: number, y: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
/** A filled rolling ridge from the left edge to the right edge, down to the bottom of the screen. */
function ridge(c: Ctx, baseY: number, amp: number, color: string, rnd: Rnd) {
  const p1 = rnd() * 6, p2 = rnd() * 6;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, TV_H);
  for (let x = 0; x <= TV_W; x += 8) c.lineTo(x, baseY + Math.sin(x / 70 + p1) * amp + Math.sin(x / 31 + p2) * amp * 0.4);
  c.lineTo(TV_W, TV_H);
  c.closePath();
  c.fill();
}
function stars(c: Ctx, n: number, maxY: number, rnd: Rnd) {
  c.fillStyle = '#fff';
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.3 + rnd() * 0.7;
    c.fillRect(rnd() * TV_W, rnd() * maxY, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  c.globalAlpha = 1;
}

const sunset = (c: Ctx, rnd: Rnd) => {
  gradient(c, 0, TV_H, ['#1e1b4b', '#9d174d', '#f97316', '#fde68a']);
  disc(c, TV_W * (0.25 + rnd() * 0.5), TV_H * 0.62, 34, '#fff3c4');
  ridge(c, TV_H * 0.72, 14, '#3b1d4a', rnd);
  ridge(c, TV_H * 0.85, 10, '#1f0f2b', rnd);
};

const night = (c: Ctx, rnd: Rnd) => {
  gradient(c, 0, TV_H, ['#020617', '#1e1b4b']);
  stars(c, 110, TV_H * 0.7, rnd);
  const mx = TV_W * (0.2 + rnd() * 0.6);
  disc(c, mx, 70, 26, '#f1f5f9');
  disc(c, mx + 10, 64, 24, '#0b1030'); // bite out of the moon
  ridge(c, TV_H * 0.8, 12, '#0b1220', rnd);
};

const ocean = (c: Ctx, rnd: Rnd) => {
  gradient(c, 0, TV_H * 0.58, ['#38bdf8', '#e0f2fe']);
  disc(c, TV_W * (0.2 + rnd() * 0.6), TV_H * 0.4, 28, '#fffbe6');
  gradient(c, TV_H * 0.58, TV_H, ['#0ea5e9', '#075985']);
  c.strokeStyle = '#fff';
  c.lineWidth = 2;
  for (let r = 0; r < 12; r++) {
    c.globalAlpha = 0.15 + r * 0.03;
    const y = TV_H * 0.6 + r * 14, ph = rnd() * 6;
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= TV_W; x += 8) c.lineTo(x, y + Math.sin(x / (30 + r * 3) + ph) * (2 + r * 0.5));
    c.stroke();
  }
  c.globalAlpha = 1;
};

const city = (c: Ctx, rnd: Rnd) => {
  gradient(c, 0, TV_H, ['#312e81', '#fb7185', '#fdba74']);
  for (let x = 0; x < TV_W; ) {
    const w = 24 + rnd() * 36, h = 60 + rnd() * 130;
    c.fillStyle = '#1f2937';
    c.fillRect(x, TV_H - h, w, h);
    c.fillStyle = '#fde047';
    for (let wy = TV_H - h + 8; wy < TV_H - 8; wy += 14)
      for (let wx = x + 5; wx < x + w - 6; wx += 10) if (rnd() < 0.45) c.fillRect(wx, wy, 5, 7);
    x += w + 2;
  }
};

const aurora = (c: Ctx, rnd: Rnd) => {
  gradient(c, 0, TV_H, ['#020617', '#0f172a']);
  stars(c, 80, TV_H * 0.6, rnd);
  ['#34d399', '#22d3ee', '#a78bfa'].forEach((col, i) => {
    const base = 70 + i * 28, ph = rnd() * 6;
    c.globalAlpha = 0.35;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, base + 70);
    for (let x = 0; x <= TV_W; x += 8) c.lineTo(x, base + Math.sin(x / 80 + ph) * 26);
    c.lineTo(TV_W, base + 70);
    c.closePath();
    c.fill();
  });
  c.globalAlpha = 1;
  ridge(c, TV_H * 0.88, 8, '#020617', rnd);
};

const mountains = (c: Ctx, rnd: Rnd) => {
  gradient(c, 0, TV_H, ['#7dd3fc', '#e0f2fe']);
  for (const [color, top, base] of [['#64748b', 70, 210], ['#475569', 110, 235]] as const) {
    for (let x = -40; x < TV_W; x += 90 + rnd() * 40) {
      const w = 130 + rnd() * 70, h = base - top - rnd() * 40;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x, base);
      c.lineTo(x + w / 2, base - h);
      c.lineTo(x + w, base);
      c.closePath();
      c.fill();
      c.fillStyle = '#f8fafc'; // snow cap
      c.beginPath();
      c.moveTo(x + w / 2, base - h);
      c.lineTo(x + w / 2 - w * 0.1, base - h + h * 0.22);
      c.lineTo(x + w / 2 + w * 0.1, base - h + h * 0.22);
      c.closePath();
      c.fill();
    }
  }
  ridge(c, TV_H * 0.86, 8, '#166534', rnd);
};

const abstract = (c: Ctx, rnd: Rnd) => {
  const hue = Math.floor(rnd() * 360);
  gradient(c, 0, TV_H, [`hsl(${hue},70%,22%)`, `hsl(${(hue + 60) % 360},70%,40%)`]);
  for (let i = 0; i < 12; i++) {
    c.globalAlpha = 0.25 + rnd() * 0.3;
    disc(c, rnd() * TV_W, rnd() * TV_H, 20 + rnd() * 70, `hsl(${(hue + rnd() * 140) % 360},80%,65%)`);
  }
  c.globalAlpha = 1;
};

export const TV_SCENES: ((c: Ctx, rnd: Rnd) => void)[] = [sunset, night, ocean, city, aurora, mountains, abstract];

/** Index of the next scene: random, never the one just shown. */
export function nextScene(prev: number, rnd: Rnd = Math.random): number {
  const n = TV_SCENES.length;
  return prev < 0 ? Math.floor(rnd() * n) : (prev + 1 + Math.floor(rnd() * (n - 1))) % n;
}
/** How long a picture stays up, in seconds. */
export const sceneSeconds = (rnd: Rnd = Math.random) => 8 + rnd() * 6;
