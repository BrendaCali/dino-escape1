/**
 * Estado y reglas del prototipo (sin red): jugadores, salas de duelo, refugio comunitario,
 * evento gratuito y libro mayor. Todo el tiempo sale de `clock`, no del dispositivo del jugador.
 */
import { randomBytes } from 'node:crypto';
import type { Level } from '../src/game/types';
import { makeVariant } from '../src/levels/variants';
import { LEVELS } from '../src/levels';
import { CONFIG, fmtDino, splitPot } from './config';
import { Ledger } from './ledger';
import type { LedgerSnapshot, Transfer } from './ledger';
import { validateSubmission } from './validate';

export class WorldError extends Error {}
const fail = (m: string): never => {
  throw new WorldError(m);
};

export interface Player {
  id: string;
  token: string;
  name: string;
  roomCode: string | null;
}

type Phase = 'building' | 'running' | 'finished';
interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  phase: Phase;
}
interface Outcome {
  kind: 'win' | 'refund';
  reason: string;
  winnerId?: string;
  times: Record<string, number>;
  settlementId: string;
  pot: number;
  winnerGets: number;
  operation: number;
  shelter: number;
}
interface Room {
  code: string;
  entry: number;
  levelId: number;
  seed: number;
  level: Level;
  players: RoomPlayer[];
  status: 'waiting' | 'racing' | 'finished' | 'cancelled';
  createdAt: number;
  startAt: number;
  endAt: number;
  valid: { id: string; t: number }[];
  decideAt: number | null;
  outcome: Outcome | null;
}

interface Attempt {
  registeredAt: number;
  startedAt?: number;
  deadline?: number;
  ms?: number;
}
interface EventState {
  cycle: number;
  levelId: number;
  seed: number;
  level: Level;
  budget: number;
  phase: 'registration' | 'attempts' | 'closed';
  openedAt: number;
  registrationEndsAt: number;
  attemptsEndsAt: number;
  participants: Record<string, Attempt & { name: string }>;
  results: { id: string; name: string; ms: number; place: number; prize: number }[] | null;
  returned: number;
}

const code = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const pa = (id: string) => `p:${id}`;
const esc = (id: string) => `esc:${id}`;

export interface Persisted {
  ledger: LedgerSnapshot;
  players: Player[];
  shelter: { rescues: number; preloaded: boolean; eventsOpened: number };
  event: Omit<EventState, 'level'> | null;
  lastEvent: Omit<EventState, 'level'> | null;
}

export class World {
  ledger = new Ledger();
  players = new Map<string, Player>();
  byToken = new Map<string, string>();
  rooms = new Map<string, Room>();
  connected = new Set<string>();
  shelter = { rescues: 0, preloaded: false, eventsOpened: 0 };
  event: EventState | null = null;
  lastEvent: Omit<EventState, 'level'> | null = null;
  log: string[] = [];
  version = 0;
  private submits = new Map<string, number[]>();

  constructor(public clock: () => number = Date.now) {}

  private bump() {
    this.version++;
  }
  private note(m: string) {
    this.log.push(`${new Date(this.clock()).toISOString()} ${m}`);
    if (this.log.length > 300) this.log.shift();
  }

  // ---------- identidad ----------
  hello(token: string | null, name: string): Player {
    const clean = (name || 'Dino').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 14) || 'Dino';
    const id0 = token ? this.byToken.get(token) : undefined;
    let p = id0 ? this.players.get(id0) : undefined;
    if (!p) {
      const id = randomBytes(5).toString('hex');
      p = { id, token: randomBytes(16).toString('hex'), name: clean, roomCode: null };
      this.players.set(id, p);
      this.byToken.set(p.token, id);
      this.ledger.settle(`INIT-${id}`, [{ kind: 'grant', from: 'mint', to: pa(id), amount: CONFIG.initialGrant, note: 'Asignación inicial de prueba' }], this.clock());
    } else if (name) p.name = clean;
    this.bump();
    return p;
  }

  setConnected(id: string, on: boolean) {
    if (on) this.connected.add(id);
    else this.connected.delete(id);
    this.bump();
  }

  // ---------- salas ----------
  private activeRoom(p: Player): Room | null {
    const r = p.roomCode ? this.rooms.get(p.roomCode) : undefined;
    return r ?? null;
  }

  private transfers(list: Transfer[], id: string) {
    this.ledger.settle(id, list, this.clock());
  }

  createRoom(pid: string, levelId: number, entry: number) {
    const p = this.players.get(pid)!;
    const cur = this.activeRoom(p);
    if (cur && (cur.status === 'waiting' || cur.status === 'racing')) fail('Ya estás en una sala.');
    if (!(CONFIG.duelLevels as readonly number[]).includes(levelId)) fail('Nivel no disponible para duelos.');
    if (!CONFIG.entryOptions.includes(entry as never)) fail('Entrada no permitida.');
    if (this.ledger.bal(pa(pid)) < entry) fail('Saldo disponible insuficiente.');
    const seed = Math.floor(Math.random() * 1e6);
    const room: Room = {
      code: code(),
      entry,
      levelId,
      seed,
      level: makeVariant(levelId, seed),
      players: [],
      status: 'waiting',
      createdAt: this.clock(),
      startAt: 0,
      endAt: 0,
      valid: [],
      decideAt: null,
      outcome: null,
    };
    this.reserve(room, p);
    this.rooms.set(room.code, room);
    this.bump();
    return room.code;
  }

  private reserve(room: Room, p: Player) {
    this.transfers([{ kind: 'reserve', from: pa(p.id), to: esc(p.id), amount: room.entry, note: `Reserva de entrada · sala ${room.code}` }], `RES-${room.code}-${p.id}`);
    room.players.push({ id: p.id, name: p.name, ready: false, phase: 'building' });
    p.roomCode = room.code;
  }

  joinRoom(pid: string, c: string) {
    const p = this.players.get(pid)!;
    const cur = this.activeRoom(p);
    if (cur && (cur.status === 'waiting' || cur.status === 'racing')) fail('Ya estás en una sala.');
    const room = this.rooms.get(c.trim().toUpperCase());
    if (!room || room.status !== 'waiting') return fail('Esa sala no existe o ya no admite jugadores.');
    if (room.players.length >= 2) fail('La sala está llena.');
    if (this.ledger.bal(pa(pid)) < room.entry) fail('Saldo disponible insuficiente.');
    this.reserve(room, p);
    this.bump();
  }

  private refundAll(room: Room, reason: string, status: 'finished' | 'cancelled') {
    const id = `REF-${room.code}`;
    const list = room.players.map((pl) => ({ kind: 'refund', from: esc(pl.id), to: pa(pl.id), amount: room.entry, note: `Devolución · ${reason}` }));
    if (list.length) this.transfers(list, id);
    room.status = status;
    room.outcome = { kind: 'refund', reason, times: Object.fromEntries(room.valid.map((v) => [v.id, v.t])), settlementId: id, pot: room.entry * room.players.length, winnerGets: 0, operation: 0, shelter: 0 };
    this.note(`sala ${room.code}: devolución (${reason})`);
    this.bump();
  }

  leaveRoom(pid: string) {
    const p = this.players.get(pid)!;
    const room = this.activeRoom(p);
    if (!room) return;
    if (room.status === 'racing') fail('La partida ya empezó: no se puede abandonar (el cronómetro sigue).');
    if (room.status === 'waiting') {
      if (room.players[0]?.id === pid) {
        this.refundAll(room, 'la sala se canceló antes de empezar', 'cancelled');
        room.players.forEach((pl) => (this.players.get(pl.id)!.roomCode = null));
      } else {
        this.transfers([{ kind: 'refund', from: esc(pid), to: pa(pid), amount: room.entry, note: `Devolución · saliste de la sala ${room.code}` }], `REFL-${room.code}-${pid}`);
        room.players = room.players.filter((x) => x.id !== pid);
        room.players.forEach((x) => (x.ready = false));
        p.roomCode = null;
      }
    } else p.roomCode = null;
    this.bump();
  }

  setReady(pid: string, ready: boolean) {
    const room = this.activeRoom(this.players.get(pid)!);
    if (!room || room.status !== 'waiting') fail('No hay sala en espera.');
    room!.players.find((x) => x.id === pid)!.ready = !!ready;
    if (room!.players.length === 2 && room!.players.every((x) => x.ready)) {
      const now = this.clock();
      room!.status = 'racing';
      room!.startAt = now + CONFIG.countdownMs;
      room!.endAt = room!.startAt + room!.level.timeSec * 1000;
      room!.players.forEach((x) => (x.phase = 'building'));
    }
    this.bump();
  }

  setPhase(pid: string, phase: Phase) {
    const room = this.activeRoom(this.players.get(pid)!);
    if (!room || room.status !== 'racing' || phase === 'finished') return;
    const pl = room.players.find((x) => x.id === pid)!;
    if (pl.phase !== 'finished') pl.phase = phase === 'running' ? 'running' : 'building';
    this.bump();
  }

  private rate(pid: string) {
    const now = this.clock();
    const list = (this.submits.get(pid) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= CONFIG.rate.maxSubmitPerMin) fail('Demasiados envíos: espera un momento.');
    list.push(now);
    this.submits.set(pid, list);
  }

  submitMatch(pid: string, sub: unknown): { ok: boolean; reason?: string } {
    const room = this.activeRoom(this.players.get(pid)!);
    if (!room || room.status !== 'racing') return fail('No hay partida en curso.');
    const now = this.clock();
    if (now < room!.startAt) fail('La partida aún no empezó.');
    if (now > room!.endAt + CONFIG.graceMs) return { ok: false, reason: 'Tiempo agotado.' };
    if (room!.valid.some((v) => v.id === pid)) return { ok: true };
    this.rate(pid);
    try {
      const v = validateSubmission(room!.level, sub, now - room!.startAt);
      if (!v.ok) {
        this.note(`sala ${room!.code}: envío rechazado de ${pid}: ${v.reason}`);
        return { ok: false, reason: v.reason };
      }
      room!.valid.push({ id: pid, t: now - room!.startAt });
      room!.players.find((x) => x.id === pid)!.phase = 'finished';
      if (room!.decideAt === null) room!.decideAt = now + CONFIG.tieMarginMs;
      this.bump();
      return { ok: true };
    } catch (e) {
      this.note(`sala ${room!.code}: falla de verificación: ${(e as Error).message}`);
      this.refundAll(room!, 'falla del sistema al verificar', 'cancelled');
      return { ok: false, reason: 'No se pudo verificar; se devolvieron los aportes.' };
    }
  }

  private decide(room: Room) {
    const sorted = [...room.valid].sort((a, b) => a.t - b.t);
    const times = Object.fromEntries(sorted.map((v) => [v.id, v.t]));
    if (sorted.length >= 2 && sorted[1].t - sorted[0].t <= CONFIG.tieMarginMs) {
      this.refundAll(room, `empate dentro de ${CONFIG.tieMarginMs} ms`, 'finished');
      room.outcome!.times = times;
      return;
    }
    const w = sorted[0].id;
    const l = room.players.find((x) => x.id !== w)!.id;
    const sp = splitPot(room.entry);
    const id = `SET-${room.code}`;
    const ok = this.ledger.settle(
      id,
      [
        { kind: 'payout', from: esc(w), to: pa(w), amount: room.entry, note: `Pago al ganador (tu aporte) · sala ${room.code}` },
        { kind: 'payout', from: esc(l), to: pa(w), amount: sp.winner - room.entry, note: `Pago al ganador (aporte del rival) · sala ${room.code}` },
        { kind: 'fee_operation', from: esc(l), to: 'operation', amount: sp.operation, note: `Comisión de operación · sala ${room.code}` },
        { kind: 'fee_shelter', from: esc(l), to: 'shelter', amount: sp.shelter, note: `Aporte al refugio · sala ${room.code}` },
      ],
      this.clock(),
    );
    if (!ok) return;
    room.status = 'finished';
    room.outcome = { kind: 'win', reason: 'primer resultado correcto', winnerId: w, times, settlementId: id, pot: sp.pot, winnerGets: sp.winner, operation: sp.operation, shelter: sp.shelter };
    this.shelter.rescues += 1;
    this.note(`sala ${room.code}: gana ${w}; refugio +1 rescate`);
    this.maybeOpenEvent();
    this.bump();
  }

  /** Avanza plazos: llamar periódicamente. Devuelve true si algo cambió. */
  tick(): boolean {
    const now = this.clock();
    const v0 = this.version;
    for (const room of this.rooms.values()) {
      if (room.status === 'waiting' && now - room.createdAt > CONFIG.roomWaitMs) {
        this.refundAll(room, 'la sala no se completó en 5 minutos', 'cancelled');
      } else if (room.status === 'racing') {
        try {
          if (room.decideAt !== null && now >= room.decideAt) this.decide(room);
          else if (room.decideAt === null && now > room.endAt + CONFIG.graceMs) this.refundAll(room, 'nadie completó el desafío', 'finished');
        } catch (e) {
          this.note(`sala ${room.code}: falla al liquidar: ${(e as Error).message}`);
          if (!this.ledger.hasSettled(`REF-${room.code}`) && !this.ledger.hasSettled(`SET-${room.code}`)) this.refundAll(room, 'falla del sistema', 'cancelled');
        }
      }
    }
    this.tickEvent(now);
    return this.version !== v0;
  }

  // ---------- evento comunitario ----------
  private maybeOpenEvent() {
    const S = CONFIG.shelter;
    if (this.event && this.event.phase !== 'closed') return;
    if (this.shelter.rescues < S.goalRescues || this.ledger.bal('shelter') < S.goalFund) return;
    const now = this.clock();
    this.ledger.settle(`EVR-${this.shelter.eventsOpened + 1}`, [{ kind: 'event_reserve', from: 'shelter', to: 'event', amount: S.eventBudget, note: 'Reserva del evento comunitario' }], now);
    this.shelter.rescues -= S.goalRescues;
    this.shelter.eventsOpened += 1;
    const cycle = this.shelter.eventsOpened;
    const levelId = S.eventLevels[(cycle - 1) % S.eventLevels.length];
    const seed = Math.floor(Math.random() * 1e6);
    this.event = {
      cycle,
      levelId,
      seed,
      level: makeVariant(levelId, seed),
      budget: S.eventBudget,
      phase: 'registration',
      openedAt: now,
      registrationEndsAt: now + S.registrationMs,
      attemptsEndsAt: now + S.registrationMs + S.attemptMs,
      participants: {},
      results: null,
      returned: 0,
    };
    this.note(`evento ${cycle} abierto`);
    this.bump();
  }

  private tickEvent(now: number) {
    const e = this.event;
    if (!e) return;
    if (e.phase === 'registration' && now >= e.registrationEndsAt) {
      e.phase = 'attempts';
      this.bump();
    }
    if (e.phase === 'attempts' && now >= e.attemptsEndsAt) this.closeEvent(e);
  }

  private closeEvent(e: EventState) {
    const S = CONFIG.shelter;
    const done = Object.entries(e.participants)
      .filter(([, a]) => a.ms !== undefined)
      .map(([id, a]) => ({ id, name: a.name, ms: a.ms! }))
      .sort((a, b) => a.ms - b.ms);
    const results: NonNullable<EventState['results']> = [];
    const transfers: Transfer[] = [];
    let paid = 0;
    let pos = 0;
    while (pos < done.length) {
      let end = pos;
      while (end + 1 < done.length && done[end + 1].ms === done[pos].ms) end++;
      const group = done.slice(pos, end + 1);
      const pool = S.prizes.slice(pos, end + 1).reduce((a, b) => a + b, 0);
      const each = Math.floor(pool / group.length);
      for (const g of group) {
        results.push({ ...g, place: pos + 1, prize: each });
        if (each > 0) {
          transfers.push({ kind: 'event_prize', from: 'event', to: pa(g.id), amount: each, note: `Premio comunitario · ciclo ${e.cycle} · puesto ${pos + 1}` });
          paid += each;
        }
      }
      pos = end + 1;
    }
    const left = this.ledger.bal('event') - paid;
    if (left > 0) transfers.push({ kind: 'event_return', from: 'event', to: 'shelter', amount: left, note: `Fondo no repartido vuelve al refugio · ciclo ${e.cycle}` });
    this.ledger.settle(`EV-${e.cycle}`, transfers, this.clock());
    e.phase = 'closed';
    e.results = results;
    e.returned = left;
    const { level: _l, ...rest } = e;
    void _l;
    this.lastEvent = rest;
    this.event = null;
    this.note(`evento ${e.cycle} cerrado: ${results.length} finalistas`);
    this.maybeOpenEvent();
    this.bump();
  }

  eventRegister(pid: string) {
    const e = this.event;
    if (!e || e.phase !== 'registration') fail('No hay inscripciones abiertas.');
    if (e!.participants[pid]) return;
    e!.participants[pid] = { name: this.players.get(pid)!.name, registeredAt: this.clock() };
    this.bump();
  }

  eventStart(pid: string): Level {
    const e = this.event;
    if (!e || e.phase !== 'attempts') return fail('El intento aún no está disponible.');
    const a = e!.participants[pid];
    if (!a) fail('No te inscribiste en este evento.');
    if (a.startedAt !== undefined) fail('Ya usaste tu intento.');
    const now = this.clock();
    a.startedAt = now;
    a.deadline = Math.min(now + e!.level.timeSec * 1000, e!.attemptsEndsAt);
    this.bump();
    return e!.level;
  }

  eventSubmit(pid: string, sub: unknown): { ok: boolean; reason?: string; ms?: number } {
    const e = this.event;
    const a = e?.participants[pid];
    if (!e || e.phase !== 'attempts' || !a || a.startedAt === undefined) return fail('No tienes un intento en curso.');
    if (a.ms !== undefined) return { ok: true, ms: a.ms };
    const now = this.clock();
    if (now > a.deadline! + CONFIG.graceMs) return { ok: false, reason: 'Tiempo agotado.' };
    this.rate(pid);
    const v = validateSubmission(e.level, sub, now - a.startedAt);
    if (!v.ok) {
      this.note(`evento: envío rechazado de ${pid}: ${v.reason}`);
      return { ok: false, reason: v.reason };
    }
    a.ms = now - a.startedAt;
    this.bump();
    return { ok: true, ms: a.ms };
  }

  // ---------- modo desarrollo ----------
  dev(pid: string, op: string, arg: number): void {
    if (!CONFIG.dev) fail('El modo desarrollo está desactivado en este servidor.');
    const now = this.clock();
    if (op === 'grant') {
      const amt = Math.max(1, Math.min(100_000, Math.round(arg)));
      this.ledger.settle(`DEVGRANT-${pid}-${now}`, [{ kind: 'grant', from: 'mint', to: pa(pid), amount: amt, note: 'Saldo de prueba (modo desarrollo)' }], now);
    } else if (op === 'preload') {
      if (this.shelter.preloaded) fail('El refugio ya fue precargado.');
      const S = CONFIG.shelter;
      this.ledger.settle(`DEVPRELOAD-${now}`, [{ kind: 'demo_preload', from: 'mint', to: 'shelter', amount: S.demoPreload.fund, note: 'DATOS PRECARGADOS DE DEMOSTRACIÓN' }], now);
      this.shelter.rescues += S.demoPreload.rescues;
      this.shelter.preloaded = true;
    } else if (op === 'advance') {
      const e = this.event;
      if (!e) fail('No hay evento activo.');
      if (e!.phase === 'registration') e!.registrationEndsAt = now;
      else if (e!.phase === 'attempts') e!.attemptsEndsAt = now;
    } else fail('Acción de desarrollo desconocida.');
    this.tick();
    this.bump();
  }

  // ---------- vistas ----------
  private pub(level: Level, dev: boolean) {
    return { ...level, solution: dev ? level.solution : [], routes: dev ? level.routes : [] };
  }

  roomView(pid: string, dev: boolean) {
    const p = this.players.get(pid)!;
    const r = this.activeRoom(p);
    if (!r) return null;
    const sp = splitPot(r.entry);
    return {
      code: r.code,
      status: r.status,
      entry: r.entry,
      levelId: r.levelId,
      levelName: r.level.name,
      difficulty: r.level.difficulty,
      timeSec: r.level.timeSec,
      split: sp,
      createdAt: r.createdAt,
      expiresAt: r.createdAt + CONFIG.roomWaitMs,
      startAt: r.startAt,
      endAt: r.endAt,
      serverNow: this.clock(),
      level: r.status === 'racing' || r.status === 'finished' ? this.pub(r.level, dev) : null,
      players: r.players.map((x) => ({
        id: x.id,
        name: x.name,
        ready: x.ready,
        me: x.id === pid,
        state: !this.connected.has(x.id) ? 'desconectado' : r.status === 'racing' ? x.phase : 'conectado',
      })),
      outcome: r.outcome,
      myFinishMs: r.valid.find((v) => v.id === pid)?.t ?? null,
    };
  }

  roomsList() {
    return [...this.rooms.values()]
      .filter((r) => r.status === 'waiting' && r.players.length < 2)
      .map((r) => ({ code: r.code, levelId: r.levelId, levelName: r.level.name, difficulty: r.level.difficulty, entry: r.entry, host: r.players[0]?.name ?? '', timeSec: r.level.timeSec }));
  }

  wallet(pid: string) {
    const mine = (a: string) => a === pa(pid) || a === esc(pid);
    return {
      available: this.ledger.bal(pa(pid)),
      locked: this.ledger.bal(esc(pid)),
      entries: this.ledger.entriesFor(mine, 80).map((e) => ({
        id: e.id,
        ts: e.ts,
        kind: e.kind,
        amount: e.to === pa(pid) || e.to === esc(pid) ? (mine(e.from) ? 0 : e.amount) : -e.amount,
        raw: e.amount,
        note: e.note,
        ref: e.ref,
      })),
    };
  }

  shelterView() {
    const S = CONFIG.shelter;
    const showing = this.event && this.event.phase !== 'closed' ? S.goalRescues : this.shelter.rescues;
    const stage = showing >= S.goalRescues ? 5 : Math.floor(showing / 25) + 1;
    return {
      rescues: this.shelter.rescues,
      shownRescues: Math.min(showing, S.goalRescues),
      goalRescues: S.goalRescues,
      goalFund: S.goalFund,
      stage,
      preloaded: this.shelter.preloaded,
      eventsOpened: this.shelter.eventsOpened,
      funds: {
        operation: this.ledger.bal('operation'),
        shelter: this.ledger.bal('shelter'),
        event: this.ledger.bal('event'),
      },
      movements: this.ledger.entriesFor((a) => a === 'shelter' || a === 'event' || a === 'operation', 40).map((e) => ({ id: e.id, ts: e.ts, kind: e.kind, amount: e.amount, note: e.note, ref: e.ref })),
      conservation: this.ledger.total() === 0,
    };
  }

  eventView(pid: string, dev: boolean) {
    const e = this.event;
    const last = this.lastEvent;
    const me = e?.participants[pid];
    return {
      active: e
        ? {
            cycle: e.cycle,
            phase: e.phase,
            budget: e.budget,
            prizes: [...CONFIG.shelter.prizes],
            levelId: e.levelId,
            levelName: e.level.name,
            timeSec: e.level.timeSec,
            registrationEndsAt: e.registrationEndsAt,
            attemptsEndsAt: e.attemptsEndsAt,
            registered: Object.keys(e.participants).length,
            finished: Object.values(e.participants).filter((a) => a.ms !== undefined).length,
            me: me ? { registered: true, started: me.startedAt !== undefined, deadline: me.deadline ?? null, ms: me.ms ?? null } : null,
            level: me?.startedAt !== undefined && me.ms === undefined ? this.pub(e.level, dev) : null,
          }
        : null,
      last: last ? { cycle: last.cycle, levelId: last.levelId, budget: last.budget, results: last.results, returned: last.returned } : null,
      serverNow: this.clock(),
    };
  }

  view(pid: string, dev: boolean) {
    return {
      wallet: this.wallet(pid),
      room: this.roomView(pid, dev),
      rooms: this.roomsList(),
      shelter: this.shelterView(),
      event: this.eventView(pid, dev),
    };
  }

  levelsInfo() {
    return LEVELS.map((l) => ({ id: l.id, name: l.name, difficulty: l.difficulty, size: l.size, timeSec: l.timeSec, dinos: l.dinos.length }));
  }

  // ---------- persistencia ----------
  serialize(): Persisted {
    const strip = (e: EventState | null) => {
      if (!e) return null;
      const { level: _l, ...rest } = e;
      void _l;
      return rest;
    };
    return { ledger: this.ledger.toJSON(), players: [...this.players.values()], shelter: this.shelter, event: strip(this.event), lastEvent: this.lastEvent };
  }

  restore(d: Persisted) {
    this.ledger = Ledger.from(d.ledger);
    for (const p of d.players) {
      this.players.set(p.id, { ...p, roomCode: null });
      this.byToken.set(p.token, p.id);
    }
    this.shelter = d.shelter;
    this.lastEvent = d.lastEvent;
    if (d.event) this.event = { ...d.event, level: makeVariant(d.event.levelId, d.event.seed) };
    // Las salas no sobreviven a un reinicio: se libera todo lo bloqueado.
    for (const p of this.players.values()) {
      const locked = this.ledger.bal(esc(p.id));
      if (locked > 0) this.ledger.settle(`RECOVER-${p.id}-${this.clock()}`, [{ kind: 'refund', from: esc(p.id), to: pa(p.id), amount: locked, note: 'Devolución · reinicio del servidor' }], this.clock());
    }
  }
}

export { fmtDino };
