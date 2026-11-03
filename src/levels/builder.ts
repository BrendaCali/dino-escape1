import { ARROW_BASE, DX, DY, mod4, opp, tileFromSides } from '../game/geometry';
import type { Dir, DinoId, Inventory, Level, LevelSource, PlacedTile, Pos, Tile } from '../game/types';

interface Pass {
  entry: Dir;
  exit: Dir;
}

const key = (x: number, y: number) => `${x},${y}`;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Expande un tramo de puntos de paso a una lista de casillas contiguas. */
function expandLeg(leg: [number, number][]): Pos[] {
  const out: Pos[] = [{ x: leg[0][0], y: leg[0][1] }];
  for (let i = 1; i < leg.length; i++) {
    let [x, y] = [out[out.length - 1].x, out[out.length - 1].y];
    const [tx, ty] = leg[i];
    if (x !== tx && y !== ty) throw new Error(`Tramo no alineado: ${x},${y} -> ${tx},${ty}`);
    while (x !== tx || y !== ty) {
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
      out.push({ x, y });
    }
  }
  return out;
}

const sideTo = (a: Pos, b: Pos): Dir => {
  for (let d = 0; d < 4; d++) if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d as Dir;
  throw new Error(`Casillas no vecinas: ${a.x},${a.y} / ${b.x},${b.y}`);
};

/**
 * Convierte la configuración editable (rutas de referencia) en un nivel jugable:
 * deriva las piezas de la solución, separa las fijas y resuelve las piedras.
 */
export function buildLevel(src: LevelSource): Level {
  const passes = new Map<string, { pos: Pos; passes: Pass[] }>();
  const routeCells = new Set<string>();
  const specials = new Set<string>();
  for (const s of src.starts) specials.add(key(s.x, s.y));
  for (const h of src.homes) specials.add(key(h.x, h.y));
  for (const p of src.portals ?? []) {
    specials.add(key(p.a.x, p.a.y));
    specials.add(key(p.b.x, p.b.y));
  }

  for (const route of src.routes) {
    for (const leg of route.legs) {
      const cells = expandLeg(leg);
      for (let i = 0; i < cells.length; i++) routeCells.add(key(cells[i].x, cells[i].y));
      for (let i = 1; i < cells.length - 1; i++) {
        const c = cells[i];
        if (specials.has(key(c.x, c.y))) throw new Error(`Nivel ${src.id}: la ruta cruza una casilla especial en ${c.x},${c.y}`);
        const entry = sideTo(c, cells[i - 1]);
        const exit = sideTo(c, cells[i + 1]);
        const k = key(c.x, c.y);
        const rec = passes.get(k) ?? { pos: c, passes: [] };
        rec.passes.push({ entry, exit });
        passes.set(k, rec);
      }
    }
  }

  const teeSet = new Set((src.teeCells ?? []).map(([x, y]) => key(x, y)));
  const fixedSet = new Set((src.fixedCells ?? []).map(([x, y]) => key(x, y)));
  const fixed: PlacedTile[] = [];
  const solution: PlacedTile[] = [];

  for (const [k, rec] of passes) {
    let tile: Tile | null = null;
    if (teeSet.has(k)) {
      if (rec.passes.length !== 1) throw new Error(`Nivel ${src.id}: la T en ${k} solo admite un paso`);
      const { entry, exit } = rec.passes[0];
      const rot = mod4(exit - ARROW_BASE[src.teeArrow]);
      tile = { type: 'tee', rot };
      const missing = mod4(rot); // la T base no abre el Norte
      if (missing === entry) throw new Error(`Nivel ${src.id}: la T en ${k} no tiene abertura de entrada (${entry})`);
    } else {
      const shapes = rec.passes.map((p) => tileFromSides(p.entry, p.exit));
      if (shapes.some((s) => !s)) throw new Error(`Nivel ${src.id}: paso inválido en ${k}`);
      const first = shapes[0]!;
      const same = (a: Tile, b: Tile) =>
        a.type === b.type && (a.type === 'straight' ? a.rot % 2 === b.rot % 2 : a.rot === b.rot);
      let merged = first;
      for (const s of shapes.slice(1)) {
        if (same(merged, s!)) continue;
        if (merged.type === 'straight' && s!.type === 'straight' && merged.rot !== s!.rot) merged = { type: 'bridge', rot: 0 };
        else if (merged.type === 'bridge' && s!.type === 'straight') continue;
        else throw new Error(`Nivel ${src.id}: pasos incompatibles en ${k}`);
      }
      tile = merged;
    }
    const placed: PlacedTile = { x: rec.pos.x, y: rec.pos.y, type: tile.type, rot: tile.rot };
    (fixedSet.has(k) ? fixed : solution).push(placed);
  }

  // Piedras
  const n = src.size;
  const rockSet = new Set<string>();
  for (const [x, y] of src.rocks ?? []) rockSet.add(key(x, y));
  for (const [x0, y0, x1, y1] of src.rockRects ?? [])
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rockSet.add(key(x, y));
  for (const k of rockSet) {
    if (routeCells.has(k) || specials.has(k)) throw new Error(`Nivel ${src.id}: una piedra bloquea la ruta o una casilla especial en ${k}`);
  }
  if (src.scatter) {
    const rnd = mulberry32(src.scatter.seed);
    const candidates: string[] = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const k = key(x, y);
        if (!routeCells.has(k) && !specials.has(k) && !rockSet.has(k)) candidates.push(k);
      }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const k of candidates.slice(0, src.scatter.count)) rockSet.add(k);
  }
  const rocks: Pos[] = [...rockSet].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });

  const dinos: DinoId[] = src.starts.map((s) => s.dino);
  const inv: Inventory = { straight: src.inventory[0], curve: src.inventory[1], tee: src.inventory[2], bridge: src.inventory[3] };
  return {
    id: src.id,
    name: src.name,
    difficulty: src.difficulty,
    note: src.note,
    size: n,
    timeSec: src.timeSec,
    inventory: inv,
    teeArrow: src.teeArrow,
    dinos,
    starts: src.starts,
    homes: src.homes,
    portals: src.portals ?? [],
    rocks,
    fixed,
    solution,
    routes: src.routes,
  };
}

export { opp };
