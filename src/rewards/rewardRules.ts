/**
 * Simulación DINO — módulo independiente del juego.
 * Todo es DEMOSTRATIVO: "DINO de prueba", sin billeteras, contratos ni dinero real.
 * Para integrar un sistema real basta con sustituir este módulo manteniendo estas funciones.
 */

export const REWARD_CONFIG = {
  /** Premio máximo por nivel (DINO de prueba). */
  maxPerLevel: 100,
  /** Descuento por cada intento fallido. */
  failedAttemptPenalty: 10,
  /** Meta de rescates de la temporada de demostración. */
  seasonGoal: 40,
  /** Rescates simulados al empezar (no son jugadores reales). */
  seasonSeedRescues: 14,
  /** Fondo colectivo simulado al empezar. */
  seasonSeedFund: 1250,
  /** Fracción de cada premio de prueba que se suma al fondo colectivo simulado. */
  fundShare: 0.2,
  seasonName: 'Temporada de demostración 0',
} as const;

export interface RewardLedger {
  /** Saldo en DINO de prueba. */
  balance: number;
  /** Premio ya cobrado por nivel; su presencia impide cobrarlo otra vez. */
  claimed: Record<number, number>;
  /** Dinosaurios rescatados localmente (suma al contador simulado de la comunidad). */
  rescues: number;
}

export const emptyLedger = (): RewardLedger => ({ balance: 0, claimed: {}, rescues: 0 });

/** max(0, 100 × tiempo restante / tiempo total − 10 × intentos fallidos), redondeado a 2 decimales. */
export function pendingReward(remainingSec: number, totalSec: number, failedAttempts: number): number {
  const base = REWARD_CONFIG.maxPerLevel * (Math.max(0, remainingSec) / totalSec);
  const value = Math.max(0, base - REWARD_CONFIG.failedAttemptPenalty * failedAttempts);
  return Math.round(value * 100) / 100;
}

export interface CompletionInput {
  levelId: number;
  remainingSec: number;
  totalSec: number;
  failedAttempts: number;
  dinosRescued: number;
}

export interface CompletionResult {
  ledger: RewardLedger;
  /** Premio entregado en esta partida (0 si el nivel ya estaba cobrado). */
  awarded: number;
  alreadyClaimed: boolean;
}

/** Se llama una sola vez al completar el nivel. Repetir un nivel cobrado solo permite practicar. */
export function applyCompletion(ledger: RewardLedger, input: CompletionInput): CompletionResult {
  if (ledger.claimed[input.levelId] !== undefined) {
    return { ledger, awarded: 0, alreadyClaimed: true };
  }
  const awarded = pendingReward(input.remainingSec, input.totalSec, input.failedAttempts);
  return {
    ledger: {
      balance: Math.round((ledger.balance + awarded) * 100) / 100,
      claimed: { ...ledger.claimed, [input.levelId]: awarded },
      rescues: ledger.rescues + input.dinosRescued,
    },
    awarded,
    alreadyClaimed: false,
  };
}

export interface CommunitySnapshot {
  season: string;
  goal: number;
  rescues: number;
  fund: number;
  progress: number;
  unlocked: boolean;
}

/** Contador comunitario local y simulado: no representa a otros jugadores reales. */
export function communitySnapshot(ledger: RewardLedger): CommunitySnapshot {
  const rescues = REWARD_CONFIG.seasonSeedRescues + ledger.rescues;
  const earned = Object.values(ledger.claimed).reduce((a, b) => a + b, 0);
  const fund = Math.round(REWARD_CONFIG.seasonSeedFund + earned * REWARD_CONFIG.fundShare);
  return {
    season: REWARD_CONFIG.seasonName,
    goal: REWARD_CONFIG.seasonGoal,
    rescues,
    fund,
    progress: Math.min(1, rescues / REWARD_CONFIG.seasonGoal),
    unlocked: rescues >= REWARD_CONFIG.seasonGoal,
  };
}
