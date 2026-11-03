/**
 * Interfaces que se sustituirán al integrar NEAR. Hoy las implementa el servidor de prueba
 * (ver ledger.ts y rooms.ts); el resto del código solo habla con estos contratos.
 */
export interface IdentityPort {
  /** Hoy: identidad de prueba por token. Después: autenticación con billetera. */
  authenticate(credential: string | null, name: string): { playerId: string; credential: string; name: string };
}

export interface BalancePort {
  available(playerId: string): number;
  locked(playerId: string): number;
}

export interface EscrowPort {
  /** Hoy: movimiento en el libro. Después: contrato de partidas que bloquea DINO. */
  reserve(playerId: string, amount: number, ref: string): void;
  refund(playerId: string, amount: number, ref: string): void;
  payout(settlementId: string, winnerId: string, loserId: string, entry: number): void;
}

export interface TreasuryPort {
  /** Hoy: cuentas `shelter`/`event`. Después: contrato de tesorería comunitaria. */
  shelterAvailable(): number;
  eventReserved(): number;
}
