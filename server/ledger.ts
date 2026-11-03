/**
 * Libro mayor de partida doble con enteros. Cada movimiento sale de una cuenta y entra en otra,
 * así que la suma de todos los saldos es siempre 0 (la cuenta `mint` va en negativo por lo
 * asignado de prueba). Una liquidación identificada solo puede aplicarse una vez.
 *
 * Cuentas: p:<id> disponible · esc:<id> bloqueado en partidas · operation · shelter · event · mint.
 * Sustituible después por saldos DINO en NEAR y por un contrato de bloqueo (ver ports.ts).
 */
export type Account = string;

export interface Entry {
  id: number;
  ts: number;
  kind: string;
  from: Account;
  to: Account;
  amount: number;
  ref: string;
  note: string;
}

export interface Transfer {
  kind: string;
  from: Account;
  to: Account;
  amount: number;
  note: string;
}

export interface LedgerSnapshot {
  balances: [string, number][];
  entries: Entry[];
  settled: string[];
  seq: number;
}

export class Ledger {
  private balances = new Map<Account, number>();
  entries: Entry[] = [];
  private settled = new Set<string>();
  private seq = 0;

  bal(a: Account) {
    return this.balances.get(a) ?? 0;
  }

  hasSettled(id: string) {
    return this.settled.has(id);
  }

  /** Aplica varios movimientos todo-o-nada con un identificador único. Devuelve false si ya se aplicó. */
  settle(id: string, transfers: Transfer[], now = Date.now()): boolean {
    if (this.settled.has(id)) return false;
    const copy = new Map(this.balances);
    for (const t of transfers) {
      if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error(`Importe inválido en ${id}`);
      if (t.from !== 'mint' && (copy.get(t.from) ?? 0) < t.amount) throw new Error(`Saldo insuficiente en ${t.from} (${id})`);
      copy.set(t.from, (copy.get(t.from) ?? 0) - t.amount);
      copy.set(t.to, (copy.get(t.to) ?? 0) + t.amount);
    }
    this.balances = copy;
    for (const t of transfers) this.entries.push({ id: ++this.seq, ts: now, kind: t.kind, from: t.from, to: t.to, amount: t.amount, ref: id, note: t.note });
    this.settled.add(id);
    if (this.entries.length > 5000) this.entries.splice(0, this.entries.length - 5000);
    return true;
  }

  /** Suma de todos los saldos: debe ser 0. */
  total() {
    let s = 0;
    for (const v of this.balances.values()) s += v;
    return s;
  }

  entriesFor(account: (a: Account) => boolean, limit = 60) {
    return this.entries.filter((e) => account(e.from) || account(e.to)).slice(-limit).reverse();
  }

  toJSON(): LedgerSnapshot {
    return { balances: [...this.balances], entries: this.entries, settled: [...this.settled], seq: this.seq };
  }

  static from(s: LedgerSnapshot): Ledger {
    const l = new Ledger();
    l.balances = new Map(s.balances);
    l.entries = s.entries;
    l.settled = new Set(s.settled);
    l.seq = s.seq;
    return l;
  }
}
