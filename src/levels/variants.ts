/**
 * Variantes inéditas de los niveles para duelos y desafíos comunitarios.
 * Cada variante cambia la semilla de las piedras repartidas (si el nivel las tiene) y gira el
 * tablero 0–270°. Antes de usarse se comprueba que la solución de referencia gire con ella y
 * resuelva el tablero con alguna configuración de salida.
 */
import { boardFromPlacements, simulate } from '../game/engine';
import type { DinoId, DirPos, ExitConfig, Level, PlacedTile, Pos } from '../game/types';
import { buildLevel } from './builder';
import { LEVEL_SOURCES } from './levelData';

export const exitOptions = (level: Level): ExitConfig[] => {
  if (level.dinos.length === 1) return [{ first: level.dinos[0], delay: 0 }];
  const list: ExitConfig[] = [];
  for (const first of level.dinos as DinoId[]) {
    list.push({ first, delay: 'after' });
    for (let s = 1; s <= 10; s++) list.push({ first, delay: s });
  }
  return list;
};

/** ¿Resuelve la solución de referencia el nivel con alguna configuración de salida? */
export function referenceSolves(level: Level): boolean {
  const board = boardFromPlacements(level, level.solution);
  return exitOptions(level).some((cfg) => simulate(level, board, cfg).outcome === 'success');
}

const rotPos = (p: Pos, n: number): Pos => ({ x: n - 1 - p.y, y: p.x });
const rotDirPos = <T extends DirPos>(p: T, n: number): T => ({ ...p, ...rotPos(p, n), dir: (((p.dir + 1) % 4) as DirPos['dir']) });
const rotTile = (t: PlacedTile, n: number): PlacedTile => ({ ...t, ...rotPos(t, n), rot: (t.rot + 1) % 4 });

function rotateOnce(l: Level): Level {
  const n = l.size;
  return {
    ...l,
    starts: l.starts.map((s) => rotDirPos(s, n)),
    homes: l.homes.map((h) => rotDirPos(h, n)),
    portals: l.portals.map((p) => ({ ...p, a: rotDirPos(p.a, n), b: rotDirPos(p.b, n) })),
    rocks: l.rocks.map((r) => rotPos(r, n)),
    fixed: l.fixed.map((t) => rotTile(t, n)),
    solution: l.solution.map((t) => rotTile(t, n)),
    routes: l.routes.map((r) => ({ ...r, legs: r.legs.map((leg) => leg.map(([x, y]) => { const q = rotPos({ x, y }, n); return [q.x, q.y] as [number, number]; })) })),
  };
}

/** Variante verificada del nivel `id`. La misma semilla da siempre el mismo tablero. */
export function makeVariant(id: number, seed: number): Level {
  const src = LEVEL_SOURCES.find((s) => s.id === id);
  if (!src) throw new Error(`Nivel ${id} inexistente`);
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = seed + attempt * 7;
    const withSeed = src.scatter ? { ...src, scatter: { ...src.scatter, seed: src.scatter.seed * 1000 + (s % 997) + 1 } } : src;
    let lv: Level;
    try {
      lv = buildLevel(withSeed);
    } catch {
      continue;
    }
    for (let k = 0; k < s % 4; k++) lv = rotateOnce(lv);
    if (referenceSolves(lv)) return lv;
  }
  throw new Error(`No se pudo verificar una variante del nivel ${id}`);
}
