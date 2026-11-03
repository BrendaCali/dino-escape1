export interface Prefs {
  sound: boolean;
  volume: number;
  reduceMotion: boolean;
  dev: boolean;
  seenHelp: boolean;
}

/** Solo preferencias y progreso de práctica; los saldos y resultados viven en el servidor. */
export interface Saved {
  version: 2;
  /** Mejor tiempo usado (segundos) por nivel completado en práctica. */
  completed: Record<number, { bestUsedSec: number }>;
  prefs: Prefs;
  name: string;
}

const KEY = 'dino-escape-prototype-v2';

export const defaultSaved = (): Saved => ({
  version: 2,
  completed: {},
  prefs: { sound: true, volume: 0.6, reduceMotion: false, dev: false, seenHelp: false },
  name: 'Dino' + Math.floor(100 + Math.random() * 900),
});

export function loadSaved(): Saved {
  const base = defaultSaved();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return withUrlFlags(base);
    const p = JSON.parse(raw) as Partial<Saved>;
    return withUrlFlags({ version: 2, completed: p.completed ?? {}, prefs: { ...base.prefs, ...(p.prefs ?? {}) }, name: p.name ?? base.name });
  } catch {
    return withUrlFlags(base);
  }
}

/** ?dev=1 abre el modo de desarrollo sin tocar los ajustes. */
function withUrlFlags(s: Saved): Saved {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('dev') === '1') s.prefs.dev = true;
    const as = q.get('as');
    if (as) s.name = as.slice(0, 14);
  } catch {
    /* sin acceso a location */
  }
  return s;
}

export function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}

/** Identidad de prueba: cada pestaña con ?as=NOMBRE tiene su propio jugador (para probar dos sesiones). */
export function tokenKey() {
  try {
    const as = new URLSearchParams(location.search).get('as');
    return as ? `dino-token-${as.slice(0, 16)}` : 'dino-token';
  } catch {
    return 'dino-token';
  }
}
export const loadToken = (): string | null => {
  try {
    return localStorage.getItem(tokenKey());
  } catch {
    return null;
  }
};
export const saveToken = (t: string) => {
  try {
    localStorage.setItem(tokenKey(), t);
  } catch {
    /* sin almacenamiento */
  }
};
