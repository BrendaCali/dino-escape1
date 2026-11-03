import { loadToken, saveToken } from '../platform/storage';
import type { Level } from '../game/types';

export interface WalletEntry {
  id: number;
  ts: number;
  kind: string;
  /** Cambio en el saldo total del jugador (0 si solo pasa de disponible a bloqueado). */
  amount: number;
  raw?: number;
  note: string;
  ref: string;
}
export interface RoomPlayerView {
  id: string;
  name: string;
  ready: boolean;
  me: boolean;
  state: string;
}
export interface Outcome {
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
export interface RoomView {
  code: string;
  status: 'waiting' | 'racing' | 'finished' | 'cancelled';
  entry: number;
  levelId: number;
  levelName: string;
  difficulty: string;
  timeSec: number;
  split: { pot: number; operation: number; shelter: number; winner: number };
  createdAt: number;
  expiresAt: number;
  startAt: number;
  endAt: number;
  serverNow: number;
  level: Level | null;
  players: RoomPlayerView[];
  outcome: Outcome | null;
  myFinishMs: number | null;
}
export interface OpenRoom {
  code: string;
  levelId: number;
  levelName: string;
  difficulty: string;
  entry: number;
  host: string;
  timeSec: number;
}
export interface ShelterView {
  rescues: number;
  shownRescues: number;
  goalRescues: number;
  goalFund: number;
  stage: number;
  preloaded: boolean;
  eventsOpened: number;
  funds: { operation: number; shelter: number; event: number };
  movements: WalletEntry[];
  conservation: boolean;
}
export interface EventResult {
  id: string;
  name: string;
  ms: number;
  place: number;
  prize: number;
}
export interface EventView {
  active: {
    cycle: number;
    phase: 'registration' | 'attempts' | 'closed';
    budget: number;
    prizes: number[];
    levelId: number;
    levelName: string;
    timeSec: number;
    registrationEndsAt: number;
    attemptsEndsAt: number;
    registered: number;
    finished: number;
    me: { registered: boolean; started: boolean; deadline: number | null; ms: number | null } | null;
    level: Level | null;
  } | null;
  last: { cycle: number; levelId: number; budget: number; results: EventResult[] | null; returned: number } | null;
  serverNow: number;
}
export interface View {
  wallet: { available: number; locked: number; entries: WalletEntry[] };
  room: RoomView | null;
  rooms: OpenRoom[];
  shelter: ShelterView;
  event: EventView;
}
export interface LevelInfo {
  id: number;
  name: string;
  difficulty: string;
  size: number;
  timeSec: number;
  dinos: number;
}
export interface NetConfig {
  entry: number[];
  tieMarginMs: number;
  roomWaitMs: number;
  operationBp: number;
  shelterBp: number;
  goalRescues: number;
  levels: LevelInfo[];
}
export interface NetState {
  status: 'connecting' | 'online' | 'offline';
  me: { id: string; name: string } | null;
  serverDev: boolean;
  config: NetConfig | null;
  view: View | null;
  /** servidor − dispositivo, en ms: solo para mostrar cuentas atrás; el servidor decide los tiempos. */
  offsetMs: number;
}

type Resolver = { ok: (d: unknown) => void; err: (e: Error) => void };

function serverUrl() {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
  } catch {
    /* sin location */
  }
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

class Net {
  state: NetState = { status: 'connecting', me: null, serverDev: false, config: null, view: null, offsetMs: 0 };
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private pending = new Map<number, Resolver>();
  private seq = 0;
  private name = 'Dino';
  private dev = false;
  private started = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  getState = () => this.state;
  private set(p: Partial<NetState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  start(name: string, dev: boolean) {
    this.name = name;
    this.dev = dev;
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private connect() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl());
    } catch {
      this.set({ status: 'offline' });
      this.again();
      return;
    }
    this.ws = ws;
    ws.onopen = async () => {
      try {
        const r = (await this.call('hello', { token: loadToken(), name: this.name, dev: this.dev })) as { id: string; token: string; name: string; serverDev: boolean; config: NetConfig };
        saveToken(r.token);
        this.set({ status: 'online', me: { id: r.id, name: r.name }, serverDev: r.serverDev, config: r.config });
      } catch {
        this.set({ status: 'offline' });
      }
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.push === 'view') {
        this.set({ view: m.data as View, offsetMs: (m.data as View).event.serverNow - Date.now() });
      } else if (m.id !== undefined) {
        const r = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (r) (m.ok ? r.ok(m.data) : r.err(new Error(m.error ?? 'Error')));
      }
    };
    ws.onclose = () => {
      this.pending.forEach((r) => r.err(new Error('Sin conexión con el servidor.')));
      this.pending.clear();
      this.set({ status: this.state.me ? 'connecting' : 'offline' });
      this.again();
    };
    ws.onerror = () => ws.close();
  }

  private again() {
    if (this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, 1500);
  }

  call<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    return new Promise((ok, err) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return err(new Error('Sin conexión con el servidor.'));
      const id = ++this.seq;
      this.pending.set(id, { ok: ok as (d: unknown) => void, err });
      ws.send(JSON.stringify({ id, op, ...args }));
    });
  }

  /** Hora estimada del servidor (solo para presentación). */
  serverNow() {
    return Date.now() + this.state.offsetMs;
  }
}

export const net = new Net();
