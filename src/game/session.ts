import { TICK_SEC, boardFromPlacements, emptyBoard, inventoryLeft, isEditable, simulate } from './engine';
import type { Board, DinoId, ExitConfig, Inventory, Level, PieceType, SimEvent, SimResult } from './types';

export type Phase = 'ready' | 'building' | 'running' | 'failing' | 'celebrating' | 'won' | 'losing' | 'lost';
export type Tool = 'place' | 'remove';

export interface SessionResult {
  remainingSec: number;
  usedSec: number;
  failedAttempts: number;
  dinosRescued: number;
}

export interface Marker {
  x: number;
  y: number;
  toward?: number;
  message: string;
  type: SimEvent['type'];
}

export interface Snapshot {
  phase: Phase;
  remainingSec: number;
  failedAttempts: number;
  board: Board;
  left: Inventory;
  sel: { type: PieceType; rot: number } | null;
  tool: Tool;
  exit: ExitConfig;
  sim: SimResult | null;
  runTick: number;
  marker: Marker | null;
  bombProgress: number;
  explosion: number;
  result: SessionResult | null;
  canUndo: boolean;
  locked: boolean;
}

export interface SessionOptions {
  claimed?: boolean;
  reducedMotion?: boolean;
  onChange?: () => void;
}

const FAIL_PAUSE_MS = 2200;
const CELEBRATE_MS = 1000;
const BOMBS_MS = 900;
const BOOM_MS = 300;
const MAX_HISTORY = 200;

/**
 * Estado de una partida. Es independiente de React y de las recompensas: la interfaz lo
 * observa mediante `subscribe` y es la única que programa el avance (`update`).
 */
export class GameSession {
  board: Board;
  sel: { type: PieceType; rot: number } | null = null;
  tool: Tool = 'place';
  exit: ExitConfig;
  result: SessionResult | null = null;

  private history: Board[] = [];
  private phase: Phase = 'ready';
  private clockStart = 0;
  private frozenRemaining: number | null = null;
  private failedAttempts = 0;
  private sim: SimResult | null = null;
  private runStart = 0;
  private runTick = 0;
  private marker: Marker | null = null;
  private failUntil = 0;
  private celebrateUntil = 0;
  private loseStart = 0;
  private lastRot = 0;
  private lastNow = 0;
  private listeners = new Set<() => void>();
  private snap!: Snapshot;
  private disposed = false;

  constructor(
    readonly level: Level,
    private opts: SessionOptions = {},
  ) {
    this.board = emptyBoard(level);
    this.exit = { first: level.dinos[0], delay: level.dinos.length > 1 ? 'after' : 0 };
    this.refresh(0);
  }

  // ---- observación ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  snapshot() {
    return this.snap;
  }
  get left(): Inventory {
    return inventoryLeft(this.level, this.board);
  }
  setReducedMotion(v: boolean) {
    this.opts.reducedMotion = v;
  }

  private remaining(now: number) {
    if (this.frozenRemaining !== null) return this.frozenRemaining;
    if (this.phase === 'ready') return this.level.timeSec;
    return Math.max(0, this.level.timeSec - (now - this.clockStart) / 1000);
  }

  private get editable() {
    return this.phase === 'building';
  }

  private refresh(now: number) {
    this.lastNow = now;
    const losingMs = this.opts.reducedMotion ? 500 : BOMBS_MS;
    const boomMs = this.opts.reducedMotion ? 400 : BOOM_MS;
    const sinceLose = now - this.loseStart;
    this.snap = {
      phase: this.phase,
      remainingSec: this.remaining(now),
      failedAttempts: this.failedAttempts,
      board: this.board,
      left: this.left,
      sel: this.sel,
      tool: this.tool,
      exit: this.exit,
      sim: this.sim,
      runTick: this.runTick,
      marker: this.marker,
      bombProgress: this.phase === 'losing' || this.phase === 'lost' ? Math.min(1, sinceLose / losingMs) : 0,
      explosion: this.phase === 'losing' || this.phase === 'lost' ? Math.max(0, Math.min(1, (sinceLose - losingMs) / boomMs)) : 0,
      result: this.result,
      canUndo: this.history.length > 0,
      locked: !this.editable,
    };
    if (!this.disposed) {
      this.opts.onChange?.();
      this.listeners.forEach((l) => l());
    }
  }

  // ---- ciclo de vida ----
  begin(now: number) {
    if (this.phase !== 'ready') return;
    this.phase = 'building';
    this.clockStart = now;
    this.refresh(now);
  }

  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }

  /** Avance temporal. Lo llama un único bucle de animación de la interfaz. */
  update(now: number) {
    if (this.disposed) return;
    const prevSecond = Math.ceil(this.snap.remainingSec);
    switch (this.phase) {
      case 'building':
      case 'running':
      case 'failing': {
        if (this.remaining(now) <= 0) {
          this.startLosing(now);
          return;
        }
        if (this.phase === 'running') this.advanceRun(now);
        else if (this.phase === 'failing' && now >= this.failUntil) {
          this.phase = 'building';
          this.sim = null;
          this.marker = null;
          this.runTick = 0;
        }
        break;
      }
      case 'celebrating':
        if (now >= this.celebrateUntil) this.phase = 'won';
        break;
      case 'losing': {
        const total = (this.opts.reducedMotion ? 500 : BOMBS_MS) + (this.opts.reducedMotion ? 400 : BOOM_MS);
        if (now - this.loseStart >= total) this.phase = 'lost';
        break;
      }
      default:
        return;
    }
    const animating = this.phase === 'running' || this.phase === 'failing' || this.phase === 'losing';
    if (animating || prevSecond !== Math.ceil(this.remaining(now)) || this.snap.phase !== this.phase) this.refresh(now);
  }

  private advanceRun(now: number) {
    const sim = this.sim!;
    const tick = (now - this.runStart) / 1000 / TICK_SEC;
    if (sim.outcome === 'success') {
      if (tick >= sim.endTick) {
        const endNow = Math.min(now, this.runStart + sim.endTick * TICK_SEC * 1000);
        this.runTick = sim.endTick;
        this.frozenRemaining = this.remaining(endNow);
        this.result = {
          remainingSec: this.frozenRemaining,
          usedSec: this.level.timeSec - this.frozenRemaining,
          failedAttempts: this.failedAttempts,
          dinosRescued: this.level.dinos.length,
        };
        this.phase = 'celebrating';
        this.celebrateUntil = now + CELEBRATE_MS;
      } else this.runTick = tick;
      return;
    }
    const ev = sim.event!;
    if (tick >= ev.tick) {
      this.runTick = ev.tick;
      this.failedAttempts++;
      this.phase = 'failing';
      this.failUntil = now + FAIL_PAUSE_MS;
      this.marker = { x: ev.x, y: ev.y, toward: ev.toward, message: ev.message, type: ev.type };
    } else this.runTick = tick;
  }

  private startLosing(now: number) {
    this.frozenRemaining = 0;
    this.phase = 'losing';
    this.loseStart = now;
    this.sim = null;
    this.marker = null;
    this.refresh(now);
  }

  // ---- edición ----
  private pushHistory() {
    this.history.push(this.board.slice());
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  select(type: PieceType | null) {
    if (type === null) this.sel = null;
    else {
      if (!this.editable && this.phase !== 'ready') return;
      this.sel = { type, rot: this.lastRot };
      this.tool = 'place';
    }
    this.refresh(this.lastNow);
  }

  rotate(dir: 1 | -1) {
    if (!this.sel) return;
    this.lastRot = (((this.sel.rot + dir) % 4) + 4) % 4;
    this.sel = { ...this.sel, rot: this.lastRot };
    this.refresh(this.lastNow);
  }

  setTool(tool: Tool) {
    this.tool = tool;
    if (tool === 'remove') this.sel = null;
    this.refresh(this.lastNow);
  }

  /** Pulsar o soltar una casilla. */
  placeAt(x: number, y: number, now = this.lastNow) {
    this.lastNow = now;
    if (!this.editable || !isEditable(this.level, x, y)) return false;
    const i = y * this.level.size + x;
    const existing = this.board[i];
    if (this.tool === 'remove' || !this.sel) {
      if (!existing) return false;
      this.pushHistory();
      this.board = this.board.slice();
      this.board[i] = null;
      this.refresh(now);
      return true;
    }
    const left = this.left;
    const avail = left[this.sel.type] + (existing && existing.type === this.sel.type ? 1 : 0);
    if (avail <= 0) return false;
    if (existing && existing.type === this.sel.type && existing.rot === this.sel.rot) return false;
    this.pushHistory();
    this.board = this.board.slice();
    this.board[i] = { type: this.sel.type, rot: this.sel.rot };
    if (this.left[this.sel.type] <= 0) this.sel = null;
    this.refresh(now);
    return true;
  }

  undo() {
    if (!this.editable || this.history.length === 0) return;
    this.board = this.history.pop()!;
    this.refresh(this.lastNow);
  }

  clear() {
    if (!this.editable || this.board.every((t) => !t)) return;
    this.pushHistory();
    this.board = emptyBoard(this.level);
    this.refresh(this.lastNow);
  }

  setExit(exit: Partial<ExitConfig>) {
    if (!this.editable) return;
    this.exit = { ...this.exit, ...exit };
    this.refresh(this.lastNow);
  }

  /** Solo modo desarrollo: coloca la solución de referencia. */
  showSolution() {
    if (!this.editable) return;
    this.pushHistory();
    this.board = boardFromPlacements(this.level, this.level.solution);
    this.sel = null;
    this.refresh(this.lastNow);
  }

  run(now: number) {
    if (!this.editable) return;
    this.sim = simulate(this.level, this.board, this.exit);
    this.runStart = now;
    this.runTick = 0;
    this.marker = null;
    this.sel = null;
    this.phase = 'running';
    this.refresh(now);
  }

  get dinosOrder(): DinoId[] {
    return this.level.dinos;
  }
}
