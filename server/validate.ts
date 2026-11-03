import { TICK_SEC, boardFromPlacements, countPlaced, isEditable, simulate } from '../src/game/engine';
import { PIECE_TYPES } from '../src/game/types';
import type { ExitConfig, Level, PieceType } from '../src/game/types';

export interface Submission {
  placements: { x: number; y: number; type: PieceType; rot: number }[];
  exit: ExitConfig;
}

export type Verdict = { ok: true; endTick: number } | { ok: false; reason: string };

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * El servidor es la autoridad: reconstruye el tablero a partir de las piezas enviadas,
 * comprueba inventario y casillas permitidas, simula el recorrido y verifica que el
 * tiempo transcurrido (medido por el servidor) permite haber construido y recorrido el camino.
 * Esto no impide la ayuda automática: solo detecta resultados imposibles o manipulados.
 */
export function validateSubmission(level: Level, sub: unknown, elapsedMs: number): Verdict {
  const s = sub as Submission;
  if (!s || !Array.isArray(s.placements) || s.placements.length > level.size * level.size) return { ok: false, reason: 'Formato inválido.' };
  const seen = new Set<number>();
  for (const p of s.placements) {
    if (!p || !isInt(p.x) || !isInt(p.y) || !isInt(p.rot) || p.rot < 0 || p.rot > 3 || !PIECE_TYPES.includes(p.type)) return { ok: false, reason: 'Pieza inválida.' };
    if (!isEditable(level, p.x, p.y)) return { ok: false, reason: `Casilla no permitida (${p.x},${p.y}).` };
    const k = p.y * level.size + p.x;
    if (seen.has(k)) return { ok: false, reason: 'Dos piezas en la misma casilla.' };
    seen.add(k);
  }
  const board = boardFromPlacements(level, s.placements);
  const used = countPlaced(board);
  for (const t of PIECE_TYPES) if (used[t] > level.inventory[t]) return { ok: false, reason: `Usaste más piezas de las disponibles (${t}).` };

  let exit: ExitConfig = { first: level.dinos[0], delay: 0 };
  if (level.dinos.length === 2) {
    const e = s.exit;
    const okDelay = e && (e.delay === 'after' || (isInt(e.delay) && e.delay >= 1 && e.delay <= 10));
    if (!e || !level.dinos.includes(e.first) || !okDelay) return { ok: false, reason: 'Orden de salida inválido.' };
    exit = { first: e.first, delay: e.delay };
  }
  const sim = simulate(level, board, exit);
  if (sim.outcome !== 'success') return { ok: false, reason: sim.event?.message ?? 'El recorrido no llega al refugio.' };
  const minMs = sim.endTick * TICK_SEC * 1000 + s.placements.length * 100 - 400;
  if (elapsedMs < minMs) return { ok: false, reason: 'Tiempo imposible para ese recorrido (marcado para revisión).' };
  return { ok: true, endTick: sim.endTick };
}
