// Tipos compartidos del juego. Direcciones: 0 = Norte, 1 = Este, 2 = Sur, 3 = Oeste.
export type Dir = 0 | 1 | 2 | 3;
export type PieceType = 'straight' | 'curve' | 'tee' | 'bridge';
export const PIECE_TYPES: PieceType[] = ['straight', 'curve', 'tee', 'bridge'];
export type DinoId = 'green' | 'orange';
export type TeeArrow = 'stem' | 'left' | 'right';

export interface Pos {
  x: number;
  y: number;
}
export interface DirPos extends Pos {
  dir: Dir;
}
export interface Tile {
  type: PieceType;
  /** Giros de 90° a la derecha respecto a la orientación base. */
  rot: number;
}
export interface PlacedTile extends Tile, Pos {}

export type Inventory = Record<PieceType, number>;
/** Tablero de piezas del jugador: índice y * size + x. */
export type Board = (Tile | null)[];

export interface StartDef extends DirPos {
  dino: DinoId;
}
export interface HomeDef extends DirPos {
  dino: DinoId;
}
export interface PortalPair {
  id: string;
  a: DirPos;
  b: DirPos;
}

/** Ruta de referencia: tramos de puntos de paso (esquinas). Cada tramo empieza y termina en una casilla especial. */
export interface RouteSpec {
  dino: DinoId;
  legs: [number, number][][];
}

/** Configuración editable de un nivel (ver src/levels/levelData.ts). */
export interface LevelSource {
  id: number;
  name: string;
  difficulty: string;
  note: string;
  size: number;
  timeSec: number;
  /** rectas / curvas / cruces en T / puentes */
  inventory: [number, number, number, number];
  teeArrow: TeeArrow;
  starts: StartDef[];
  homes: HomeDef[];
  portals?: PortalPair[];
  rocks?: [number, number][];
  /** Rectángulos de piedras [x0, y0, x1, y1] (inclusivo). */
  rockRects?: [number, number, number, number][];
  /** Piedras repartidas con semilla fija; nunca tocan la ruta de referencia. */
  scatter?: { count: number; seed: number };
  routes: RouteSpec[];
  /** Casillas de la ruta que vienen ya colocadas (piezas fijas). */
  fixedCells?: [number, number][];
  /** Casillas de la ruta donde la solución usa un cruce en T. */
  teeCells?: [number, number][];
}

export interface Level {
  id: number;
  name: string;
  difficulty: string;
  note: string;
  size: number;
  timeSec: number;
  inventory: Inventory;
  teeArrow: TeeArrow;
  dinos: DinoId[];
  starts: StartDef[];
  homes: HomeDef[];
  portals: PortalPair[];
  rocks: Pos[];
  fixed: PlacedTile[];
  /** Solución de referencia (solo piezas del jugador). */
  solution: PlacedTile[];
  routes: RouteSpec[];
}

export type FailReason =
  | 'out'
  | 'cut'
  | 'rock'
  | 'wrong-home'
  | 'loop'
  | 'arrow'
  | 'start'
  | 'collision';

export interface Step extends Pos {
  /** El paso llega a esta casilla por un portal. */
  teleport?: boolean;
}

export interface TraceFail {
  reason: FailReason;
  /** Última casilla donde estuvo el dinosaurio. */
  at: Pos;
  /** Dirección en la que intentó avanzar. */
  toward: Dir;
  message: string;
}

export interface Trace {
  dino: DinoId;
  steps: Step[];
  outcome: 'home' | 'fail';
  fail?: TraceFail;
}

export interface SimEvent {
  type: 'fail' | 'collision';
  tick: number;
  dino?: DinoId;
  reason: FailReason;
  /** Posición del suceso en coordenadas de tablero (puede ser fraccionaria). */
  x: number;
  y: number;
  toward?: Dir;
  message: string;
}

export interface SimResult {
  traces: Partial<Record<DinoId, Trace>>;
  starts: Partial<Record<DinoId, number>>;
  arrival: Partial<Record<DinoId, number>>;
  outcome: 'success' | 'fail';
  endTick: number;
  event?: SimEvent;
}

export interface ExitConfig {
  first: DinoId;
  /** Segundos de retraso del segundo dinosaurio o 'after' = cuando llegue el primero. */
  delay: number | 'after';
}
