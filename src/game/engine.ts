import { DX, DY, exitSide, hasOpening, opp } from './geometry';
import type {
  Board,
  Dir,
  DinoId,
  DirPos,
  ExitConfig,
  FailReason,
  HomeDef,
  Inventory,
  Level,
  PieceType,
  SimEvent,
  SimResult,
  StartDef,
  Step,
  Tile,
  Trace,
} from './types';
import { PIECE_TYPES } from './types';

/** Segundos que tarda un dinosaurio en pasar de una casilla a la siguiente (velocidad constante). */
export const TICK_SEC = 0.5;

export type CellInfo =
  | { kind: 'rock' }
  | { kind: 'start'; def: StartDef }
  | { kind: 'home'; def: HomeDef }
  | { kind: 'portal'; def: DirPos; pairId: string; partner: DirPos }
  | { kind: 'fixed'; tile: Tile };

const cache = new WeakMap<Level, Map<number, CellInfo>>();

export function cellMap(level: Level): Map<number, CellInfo> {
  let m = cache.get(level);
  if (m) return m;
  m = new Map();
  const n = level.size;
  for (const r of level.rocks) m.set(r.y * n + r.x, { kind: 'rock' });
  for (const s of level.starts) m.set(s.y * n + s.x, { kind: 'start', def: s });
  for (const h of level.homes) m.set(h.y * n + h.x, { kind: 'home', def: h });
  for (const p of level.portals) {
    m.set(p.a.y * n + p.a.x, { kind: 'portal', def: p.a, pairId: p.id, partner: p.b });
    m.set(p.b.y * n + p.b.x, { kind: 'portal', def: p.b, pairId: p.id, partner: p.a });
  }
  for (const f of level.fixed) m.set(f.y * n + f.x, { kind: 'fixed', tile: { type: f.type, rot: f.rot } });
  cache.set(level, m);
  return m;
}

export const inBounds = (level: Level, x: number, y: number) =>
  x >= 0 && y >= 0 && x < level.size && y < level.size;

export const emptyBoard = (level: Level): Board => new Array(level.size * level.size).fill(null);

/** Una casilla es editable si no tiene piedra, salida, refugio, portal ni pieza fija. */
export const isEditable = (level: Level, x: number, y: number) =>
  inBounds(level, x, y) && !cellMap(level).has(y * level.size + x);

export function boardFromPlacements(level: Level, placements: { x: number; y: number; type: PieceType; rot: number }[]): Board {
  const b = emptyBoard(level);
  for (const p of placements) b[p.y * level.size + p.x] = { type: p.type, rot: p.rot };
  return b;
}

export function countPlaced(board: Board): Inventory {
  const c: Inventory = { straight: 0, curve: 0, tee: 0, bridge: 0 };
  for (const t of board) if (t) c[t.type]++;
  return c;
}

export function inventoryLeft(level: Level, board: Board): Inventory {
  const used = countPlaced(board);
  const left = { ...level.inventory };
  for (const t of PIECE_TYPES) left[t] -= used[t];
  return left;
}

/** Pieza efectiva (fija o del jugador) en una casilla, o null. */
export function tileAt(level: Level, board: Board, x: number, y: number): Tile | null {
  const info = cellMap(level).get(y * level.size + x);
  if (info?.kind === 'fixed') return info.tile;
  if (info) return null;
  return board[y * level.size + x] ?? null;
}

const MESSAGES: Record<FailReason, string> = {
  out: '¡El dino se salió del tablero! Cierra ese camino.',
  cut: 'Camino cortado: aquí las piezas no se conectan.',
  rock: '¡Una piedra bloquea el camino!',
  'wrong-home': 'Ese no es su refugio: cada dino tiene el suyo.',
  loop: '¡Bucle! El dino pasa otra vez por el mismo sitio.',
  arrow: 'La flecha de la T apunta hacia donde venía el dino.',
  start: 'Eso es una salida, no un camino.',
  collision: '¡Choque! Dos dinos coincidieron en el mismo tramo.',
};

/** Recorre el camino de un dinosaurio sobre el tablero actual. */
export function traceDino(level: Level, board: Board, dino: DinoId): Trace {
  const start = level.starts.find((s) => s.dino === dino);
  if (!start) throw new Error(`Sin salida para ${dino}`);
  const cells = cellMap(level);
  const steps: Step[] = [{ x: start.x, y: start.y }];
  const seen = new Set<string>();
  let x = start.x;
  let y = start.y;
  let heading: Dir = start.dir;

  const fail = (reason: FailReason): Trace => ({
    dino,
    steps,
    outcome: 'fail',
    fail: { reason, at: { x, y }, toward: heading, message: MESSAGES[reason] },
  });

  for (let guard = 0; guard < 20000; guard++) {
    const nx = x + DX[heading];
    const ny = y + DY[heading];
    if (!inBounds(level, nx, ny)) return fail('out');
    const enter = opp(heading);
    const info = cells.get(ny * level.size + nx);

    if (info?.kind === 'rock') return fail('rock');
    if (info?.kind === 'start') return fail('start');

    if (info?.kind === 'home') {
      if (info.def.dir !== enter) return fail('cut');
      x = nx;
      y = ny;
      steps.push({ x, y });
      if (info.def.dino !== dino) return fail('wrong-home');
      return { dino, steps, outcome: 'home' };
    }

    if (info?.kind === 'portal') {
      if (info.def.dir !== enter) return fail('cut');
      const key = `p${nx},${ny}`;
      if (seen.has(key)) {
        x = nx;
        y = ny;
        steps.push({ x, y });
        return fail('loop');
      }
      seen.add(key);
      steps.push({ x: nx, y: ny });
      steps.push({ x: info.partner.x, y: info.partner.y, teleport: true });
      x = info.partner.x;
      y = info.partner.y;
      heading = info.partner.dir;
      continue;
    }

    const tile = info?.kind === 'fixed' ? info.tile : board[ny * level.size + nx];
    if (!tile) return fail('cut');
    if (!hasOpening(tile, enter)) return fail('cut');
    const key = `${nx},${ny},${enter}`;
    const out = exitSide(tile, enter, level.teeArrow);
    x = nx;
    y = ny;
    steps.push({ x, y });
    if (out === 'arrow') return fail('arrow');
    if (out === null) return fail('cut');
    if (seen.has(key)) return fail('loop');
    seen.add(key);
    heading = out;
  }
  return fail('loop');
}

/** Retraso del segundo dinosaurio en ticks. */
const delayTicks = (delay: number | 'after', firstLen: number) =>
  delay === 'after' ? firstLen + 1 : Math.round(delay / TICK_SEC);

/** Eje (0 vertical, 1 horizontal) con el que un dinosaurio cruza una casilla en el paso i. */
function axisAt(trace: Trace, i: number): number | null {
  if (i <= 0) return null;
  const a = trace.steps[i - 1];
  const b = trace.steps[i];
  if (b.teleport) return null;
  return a.x !== b.x ? 1 : 0;
}

/** Simula el recorrido completo con tiempos de salida explícitos (en ticks). */
export function simulateWithStarts(level: Level, board: Board, startTicks: Partial<Record<DinoId, number>>): SimResult {
  const traces: Partial<Record<DinoId, Trace>> = {};
  for (const d of level.dinos) traces[d] = traceDino(level, board, d);

  const events: SimEvent[] = [];
  const arrival: Partial<Record<DinoId, number>> = {};

  for (const d of level.dinos) {
    const tr = traces[d]!;
    const s = startTicks[d] ?? 0;
    const last = tr.steps.length - 1;
    if (tr.outcome === 'home') arrival[d] = s + last;
    else {
      const f = tr.fail!;
      events.push({
        type: 'fail',
        tick: s + last + 0.4,
        dino: d,
        reason: f.reason,
        x: f.at.x,
        y: f.at.y,
        toward: f.toward,
        message: f.message,
      });
    }
  }

  if (level.dinos.length === 2) {
    const [a, b] = level.dinos;
    const ta = traces[a]!;
    const tb = traces[b]!;
    const sa = startTicks[a] ?? 0;
    const sb = startTicks[b] ?? 0;
    const endA = sa + ta.steps.length - 1;
    const endB = sb + tb.steps.length - 1;
    const maxT = Math.max(endA, endB);
    const idx = (s: number, tr: Trace, t: number) => {
      const i = t - s;
      if (i < 0) return 0; // esperando en la salida
      if (i >= tr.steps.length) return -1; // ya retirado / detenido
      return i;
    };
    for (let t = 0; t <= maxT; t++) {
      const ia = idx(sa, ta, t);
      const ib = idx(sb, tb, t);
      if (ia < 0 || ib < 0) continue;
      const pa = ta.steps[ia];
      const pb = tb.steps[ib];
      if (pa.x === pb.x && pa.y === pb.y) {
        const tile = tileAt(level, board, pa.x, pa.y);
        const bridge = tile?.type === 'bridge' && !cellMap(level).has(pa.y * level.size + pa.x);
        const ax = axisAt(ta, ia);
        const bx = axisAt(tb, ib);
        const crossing = bridge && ax !== null && bx !== null && ax !== bx;
        if (!crossing) {
          events.push({ type: 'collision', tick: t, reason: 'collision', x: pa.x, y: pa.y, message: MESSAGES.collision });
          break;
        }
      }
      const ja = idx(sa, ta, t + 1);
      const jb = idx(sb, tb, t + 1);
      if (ja >= 0 && jb >= 0 && t + 1 - sa > 0 && t + 1 - sb > 0 && t - sa >= 0 && t - sb >= 0) {
        const qa = ta.steps[ja];
        const qb = tb.steps[jb];
        if (qa.x === pb.x && qa.y === pb.y && qb.x === pa.x && qb.y === pa.y && (pa.x !== qa.x || pa.y !== qa.y)) {
          events.push({
            type: 'collision',
            tick: t + 0.5,
            reason: 'collision',
            x: (pa.x + qa.x) / 2,
            y: (pa.y + qa.y) / 2,
            message: MESSAGES.collision,
          });
          break;
        }
      }
    }
  }

  events.sort((p, q) => p.tick - q.tick);
  const ev = events[0];
  if (ev) return { traces, starts: startTicks, arrival, outcome: 'fail', endTick: ev.tick, event: ev };
  const endTick = Math.max(...level.dinos.map((d) => arrival[d] ?? 0));
  return { traces, starts: startTicks, arrival, outcome: 'success', endTick };
}

export function simulate(level: Level, board: Board, exit: ExitConfig): SimResult {
  if (level.dinos.length === 1) return simulateWithStarts(level, board, { [level.dinos[0]]: 0 });
  const first = exit.first;
  const second = level.dinos.find((d) => d !== first)!;
  const firstLen = traceDino(level, board, first).steps.length - 1;
  return simulateWithStarts(level, board, { [first]: 0, [second]: delayTicks(exit.delay, firstLen) });
}

export interface Pose {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
  /** 1 mira a la derecha, -1 a la izquierda. */
  facing: 1 | -1;
  mood: 'wait' | 'walk' | 'oops' | 'happy';
  moving: boolean;
}

/** Posición animada de un dinosaurio en un instante (en ticks) de la simulación. */
export function poseAt(sim: SimResult, level: Level, dino: DinoId, tick: number): Pose {
  const tr = sim.traces[dino]!;
  const s = sim.starts[dino] ?? 0;
  const st = level.starts.find((q) => q.dino === dino)!;
  const baseFacing: 1 | -1 = st.dir === 3 ? -1 : 1;
  const t0 = tick - s;
  const m = tr.steps.length;
  if (t0 <= 0) return { x: tr.steps[0].x, y: tr.steps[0].y, scale: 1, visible: true, facing: baseFacing, mood: 'wait', moving: false };
  if (t0 >= m - 1) {
    const l = tr.steps[m - 1];
    const prev = tr.steps[Math.max(0, m - 2)];
    const facing: 1 | -1 = l.x < prev.x ? -1 : l.x > prev.x ? 1 : baseFacing;
    if (tr.outcome === 'home') {
      const over = t0 - (m - 1);
      return { x: l.x, y: l.y, scale: Math.max(0, 1 - over * 2.5), visible: over < 0.4, facing, mood: 'happy', moving: false };
    }
    return { x: l.x, y: l.y, scale: 1, visible: true, facing, mood: 'oops', moving: false };
  }
  const i = Math.floor(t0);
  const f = t0 - i;
  const a = tr.steps[i];
  const b = tr.steps[i + 1];
  let prevFacing = baseFacing;
  for (let k = i; k >= 1; k--) {
    const p = tr.steps[k - 1];
    const q = tr.steps[k];
    if (!q.teleport && p.x !== q.x) {
      prevFacing = q.x > p.x ? 1 : -1;
      break;
    }
  }
  if (b.teleport) {
    return f < 0.5
      ? { x: a.x, y: a.y, scale: 1 - f * 2, visible: true, facing: prevFacing, mood: 'walk', moving: true }
      : { x: b.x, y: b.y, scale: f * 2 - 1, visible: true, facing: prevFacing, mood: 'walk', moving: true };
  }
  const facing: 1 | -1 = b.x > a.x ? 1 : b.x < a.x ? -1 : prevFacing;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, scale: 1, visible: true, facing, mood: 'walk', moving: true };
}

