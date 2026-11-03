import type { Dir, Inventory, PieceType, Tile, TeeArrow } from './types';

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const opp = (d: number): Dir => ((d + 2) % 4) as Dir;
export const mod4 = (n: number): Dir => (((n % 4) + 4) % 4) as Dir;

/** Aberturas de cada pieza con rotación 0. La T abre Este, Sur y Oeste. */
const BASE_OPENINGS: Record<PieceType, Dir[]> = {
  straight: [0, 2],
  curve: [0, 1],
  tee: [1, 2, 3],
  bridge: [0, 1, 2, 3],
};

export const openings = (t: Tile): Dir[] => BASE_OPENINGS[t.type].map((d) => mod4(d + t.rot));
export const hasOpening = (t: Tile, side: Dir) => openings(t).includes(side);

export const ARROW_BASE: Record<TeeArrow, Dir> = { stem: 2, left: 3, right: 1 };
export const teeArrowDir = (t: Tile, arrow: TeeArrow): Dir => mod4(ARROW_BASE[arrow] + t.rot);

/**
 * Lado por el que sale un dinosaurio que entra a la pieza por `enterSide`.
 * Devuelve 'arrow' si en una T entra justo por el lado de la flecha, o null si no hay abertura.
 */
export function exitSide(t: Tile, enterSide: Dir, arrow: TeeArrow): Dir | null | 'arrow' {
  if (!hasOpening(t, enterSide)) return null;
  switch (t.type) {
    case 'bridge':
      return opp(enterSide);
    case 'tee': {
      const a = teeArrowDir(t, arrow);
      return a === enterSide ? 'arrow' : a;
    }
    default: {
      const o = openings(t);
      return o[0] === enterSide ? o[1] : o[0];
    }
  }
}

export const emptyInventory = (): Inventory => ({ straight: 0, curve: 0, tee: 0, bridge: 0 });

/** Rotación de una recta (eje) o curva a partir de los lados que conecta; null si no encaja. */
export function tileFromSides(a: Dir, b: Dir): Tile | null {
  if (a === b) return null;
  if (opp(a) === b) return { type: 'straight', rot: a % 2 === 0 ? 0 : 1 };
  for (let r = 0; r < 4; r++) {
    const o = [mod4(r), mod4(r + 1)];
    if (o.includes(a) && o.includes(b)) return { type: 'curve', rot: r };
  }
  return null;
}

export const DIR_NAMES = ['N', 'E', 'S', 'O'];
