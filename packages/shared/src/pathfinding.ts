export interface Pt { x: number; y: number }

/**
 * A* on a tile grid (8-neighbour, no corner cutting). `grid[y*w+x] === 1` is walkable.
 * Returns tile coordinates from `from` to `to` inclusive, or null if unreachable.
 */
export function findPath(grid: Uint8Array, w: number, h: number, from: Pt, to: Pt): Pt[] | null {
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 1;
  if (!ok(from.x, from.y) || !ok(to.x, to.y)) return null;
  const idx = (p: Pt) => p.y * w + p.x;
  const hFn = (x: number, y: number) => {
    const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); // octile
  };
  const g = new Float32Array(w * h).fill(Infinity);
  const prev = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  // small binary heap of [f, index]
  const heap: [number, number][] = [];
  const push = (e: [number, number]) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  g[idx(from)] = 0;
  push([hFn(from.x, from.y), idx(from)]);
  const goal = idx(to);
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      const path: Pt[] = [];
      for (let c = cur; c !== -1; c = prev[c]) path.push({ x: c % w, y: Math.floor(c / w) });
      return path.reverse();
    }
    const cx = cur % w, cy = Math.floor(cur / w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!ok(nx, ny)) continue;
        if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue; // no corner cutting
        const ni = ny * w + nx;
        const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          prev[ni] = cur;
          push([ng + hFn(nx, ny), ni]);
        }
      }
  }
  return null;
}

/** A free walkable tile next to `target` that is closest (by path) to `from`. */
export function pathToNeighbour(grid: Uint8Array, w: number, h: number, from: Pt, target: Pt): Pt[] | null {
  let best: Pt[] | null = null;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const p = findPath(grid, w, h, from, { x: target.x + dx, y: target.y + dy });
      if (p && (!best || p.length < best.length)) best = p;
    }
  return best;
}
