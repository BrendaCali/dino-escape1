/**
 * Parámetros configurables del prototipo. Todos los importes están en "unidades mínimas":
 * 1 DINO de prueba = 100 unidades, para no usar coma flotante en los cálculos.
 */
export const UNIT = 100;
export const dino = (n: number) => Math.round(n * UNIT);
export const fmtDino = (u: number) => (u / UNIT).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const CONFIG = {
  port: Number(process.env.PORT ?? 8787),
  /** Modo desarrollo del servidor: habilita las acciones dev.* (no usar en producción). */
  dev: process.env.NODE_ENV !== 'production' || process.env.DINO_DEV === '1',

  initialGrant: dino(100),
  /** Entradas permitidas por jugador. Parámetro inicial: 10 DINO. */
  entryOptions: [dino(10)],
  /** Comisiones en puntos básicos del fondo (250 = 2,5 %). */
  operationBp: 250,
  shelterBp: 250,

  roomWaitMs: 5 * 60_000,
  countdownMs: 4_000,
  /** Margen de empate sobre tiempos de finalización medidos por el servidor. */
  tieMarginMs: 500,
  /** Tolerancia de red tras el límite de tiempo. */
  graceMs: 1_500,
  /** Niveles disponibles para duelos. */
  duelLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9],

  shelter: {
    goalRescues: 100,
    goalFund: dino(50),
    eventBudget: dino(50),
    /** Primer, segundo y tercer puesto. */
    prizes: [dino(25), dino(15), dino(10)],
    registrationMs: 24 * 3600_000,
    attemptMs: 24 * 3600_000,
    /** Nivel del evento de cada ciclo, en rotación (variante inédita). */
    eventLevels: [4, 5, 6],
    demoPreload: { rescues: 99, fund: dino(49.5) },
  },

  rate: { windowMs: 1000, maxMessages: 25, maxSubmitPerMin: 12 },
} as const;

/** Reparto de un fondo de duelo con aritmética entera. */
export function splitPot(entry: number, players = 2) {
  const pot = entry * players;
  const operation = Math.floor((pot * CONFIG.operationBp) / 10_000);
  const shelter = Math.floor((pot * CONFIG.shelterBp) / 10_000);
  return { pot, operation, shelter, winner: pot - operation - shelter };
}
