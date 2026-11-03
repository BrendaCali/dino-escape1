import type { CSSProperties } from 'react';
import { ARROW_BASE } from '../game/geometry';
import type { DinoId, Dir, PieceType, TeeArrow } from '../game/types';

/** Todo el arte está dibujado en SVG propio. Cada casilla mide 100 × 100 y el camino 34 de ancho. */
export const CELL = 100;
export const PATH_W = 38;
const OUTLINE_W = 50;

export const DINO_COLORS: Record<DinoId, { body: string; dark: string; belly: string; light: string; spike: string; spot: string; name: string }> = {
  green: { body: '#5ec45a', dark: '#2f8a3c', belly: '#d8f2a8', light: '#9be58a', spike: '#f7c13a', spot: '#2f8a3c', name: 'verde' },
  orange: { body: '#f7973a', dark: '#c9620f', belly: '#ffe2ae', light: '#ffc274', spike: '#e0568f', spot: '#c9620f', name: 'naranja' },
};

export const PORTAL_STYLES: Record<string, { color: string; glow: string; symbol: 'diamond' | 'star' | 'moon' }> = {
  A: { color: '#8f5be8', glow: '#d3b8ff', symbol: 'diamond' },
  B: { color: '#16a7c9', glow: '#a8ecf7', symbol: 'star' },
  C: { color: '#e0568f', glow: '#ffc3da', symbol: 'moon' },
};

const SAND = { border: '#8a5a1c', fill: '#f8e3a4', speck: '#dcbc70' };
const STONE = { border: '#4d5159', fill: '#aeaa9e', seam: '#7f7b70' };

const PATHS: Record<PieceType, string[]> = {
  straight: ['M50 0 L50 100'],
  curve: ['M50 0 A50 50 0 0 0 100 50'],
  tee: ['M0 50 L100 50', 'M50 50 L50 100'],
  bridge: ['M0 50 L100 50'],
};

interface TileArtProps {
  type: PieceType;
  rot: number;
  fixed?: boolean;
  arrow?: TeeArrow;
  ghost?: boolean;
  bad?: boolean;
}

export function ArrowMark({ base }: { base: number }) {
  return (
    <g transform={`rotate(${base * 90} 50 50)`}>
      <path d="M50 9 L66 33 L55 33 L55 40 L45 40 L45 33 L34 33 Z" fill="#fff6dc" stroke="#7a3d12" strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

export function TileArt({ type, rot, fixed, arrow = 'stem', ghost, bad }: TileArtProps) {
  const c = fixed ? STONE : SAND;
  const paths = PATHS[type];
  return (
    <g opacity={ghost ? 0.7 : 1} style={bad ? { filter: 'hue-rotate(-40deg) saturate(1.6)' } : undefined}>
      <g transform={`rotate(${rot * 90} 50 50)`}>
        {type === 'bridge' ? (
          <>
            <path d={paths[0]} stroke={c.border} strokeWidth={OUTLINE_W} fill="none" />
            <path d={paths[0]} stroke={c.fill} strokeWidth={PATH_W} fill="none" />
            <rect x="30" y="-2" width="40" height="104" rx="4" fill="#000" opacity="0.2" transform="translate(5 4)" />
            <rect x="30" y="-2" width="40" height="104" rx="4" fill="#c98b4b" stroke="#6b4223" strokeWidth="5" />
            {[8, 22, 36, 50, 64, 78, 92].map((y) => (
              <line key={y} x1="32" y1={y} x2="68" y2={y} stroke="#8a5a2e" strokeWidth="3" />
            ))}
            <line x1="35" y1="-2" x2="35" y2="102" stroke="#5a3719" strokeWidth="4" />
            <line x1="65" y1="-2" x2="65" y2="102" stroke="#5a3719" strokeWidth="4" />
          </>
        ) : (
          <>
            {paths.map((d, i) => (
              <path key={`o${i}`} d={d} stroke={c.border} strokeWidth={OUTLINE_W} fill="none" />
            ))}
            {paths.map((d, i) => (
              <path key={`f${i}`} d={d} stroke={c.fill} strokeWidth={PATH_W} fill="none" />
            ))}
            {fixed
              ? paths.map((d, i) => <path key={`s${i}`} d={d} stroke={STONE.seam} strokeWidth="2.5" strokeDasharray="7 9" fill="none" />)
              : paths.map((d, i) => <path key={`s${i}`} d={d} stroke={SAND.speck} strokeWidth="3" strokeDasharray="1 11" strokeLinecap="round" fill="none" />)}
          </>
        )}
        {type === 'tee' && <circle cx="50" cy="50" r="9" fill={fixed ? '#85817a' : '#d9b569'} stroke={c.border} strokeWidth="3" />}
      </g>
      {type === 'tee' && <g transform={`rotate(${rot * 90} 50 50)`}><ArrowMark base={ARROW_BASE[arrow]} /></g>}
      {fixed && (
        <g transform="translate(70 6)">
          <rect x="0" y="8" width="22" height="16" rx="3" fill="#3f434b" stroke="#e8e3d4" strokeWidth="2" />
          <path d="M5 8 V4 a6 6 0 0 1 12 0 V8" fill="none" stroke="#e8e3d4" strokeWidth="3" />
          <circle cx="11" cy="16" r="2.5" fill="#e8e3d4" />
        </g>
      )}
    </g>
  );
}

/** Roca: variación determinista según la casilla. */
export function RockArt({ seed }: { seed: number }) {
  const rot = ((seed * 37) % 30) - 15;
  const flip = seed % 2 ? 1 : -1;
  return (
    <g transform={`translate(50 52) rotate(${rot}) scale(${flip} 1) translate(-50 -52)`}>
      <ellipse cx="50" cy="82" rx="36" ry="8" fill="#000" opacity="0.2" />
      <path d="M14 78 Q6 52 26 34 Q46 14 70 26 Q94 40 88 68 Q82 84 50 84 Q24 86 14 78 Z" fill="#8d9199" stroke="#4a4e57" strokeWidth="4" strokeLinejoin="round" />
      <path d="M26 40 Q44 20 66 30" stroke="#c9ccd2" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M52 52 L60 74 M36 62 L44 76" stroke="#5f636b" strokeWidth="3" strokeLinecap="round" />
      <path d="M62 30 q6 -10 12 -2 q-4 8 -12 2z" fill="#6bbf5a" />
    </g>
  );
}

function SymbolShape({ kind, color, size = 1 }: { kind: 'leaf' | 'sun' | 'diamond' | 'star' | 'moon'; color: string; size?: number }) {
  const t = `scale(${size})`;
  switch (kind) {
    case 'leaf':
      return (
        <g transform={t}>
          <path d="M-12 8 Q-14 -12 8 -14 Q14 8 -8 12 Z" fill={color} stroke="#1f5b2a" strokeWidth="2" />
          <path d="M-10 10 L6 -8" stroke="#1f5b2a" strokeWidth="2" />
        </g>
      );
    case 'sun':
      return (
        <g transform={t}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect key={a} x="-1.8" y="-15" width="3.6" height="7" rx="1.8" fill={color} transform={`rotate(${a})`} />
          ))}
          <circle r="7" fill={color} stroke="#7a3d12" strokeWidth="2" />
        </g>
      );
    case 'diamond':
      return <path transform={t} d="M0 -13 L11 0 L0 13 L-11 0 Z" fill={color} stroke="#fff" strokeWidth="2.5" />;
    case 'star':
      return (
        <path
          transform={t}
          d="M0 -14 L4 -4.5 L14 -4 L6.5 2.5 L9 12 L0 7 L-9 12 L-6.5 2.5 L-14 -4 L-4 -4.5 Z"
          fill={color}
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      );
    case 'moon':
      return <path transform={t} d="M5 -13 A13 13 0 1 0 5 13 A10 10 0 1 1 5 -13 Z" fill={color} stroke="#fff" strokeWidth="2.2" />;
  }
}

export const dinoSymbol = (d: DinoId) => (d === 'green' ? 'leaf' : 'sun');

/** Tramo de camino que sale hacia `dir` desde el centro (base: Norte). */
function Stub({ dir, fixed = true }: { dir: Dir; fixed?: boolean }) {
  const c = fixed ? SAND : SAND;
  return (
    <g transform={`rotate(${dir * 90} 50 50)`}>
      <path d="M50 0 L50 50" stroke={c.border} strokeWidth={OUTLINE_W} fill="none" />
      <path d="M50 0 L50 50" stroke={c.fill} strokeWidth={PATH_W} fill="none" />
    </g>
  );
}

export function StartArt({ dino, dir }: { dino: DinoId; dir: Dir }) {
  const col = DINO_COLORS[dino];
  return (
    <g>
      <Stub dir={dir} />
      <circle cx="50" cy="50" r="36" fill="#7a5230" stroke="#4b2f17" strokeWidth="4" />
      <circle cx="50" cy="50" r="28" fill="#a87a4a" stroke="#c99a68" strokeWidth="2" strokeDasharray="4 5" />
      <g transform="translate(22 8)">
        <line x1="0" y1="0" x2="0" y2="34" stroke="#4b2f17" strokeWidth="4" strokeLinecap="round" />
        <path d="M2 2 L28 9 L2 18 Z" fill={col.body} stroke={col.dark} strokeWidth="2.5" strokeLinejoin="round" />
        <g transform="translate(11 10)">
          <SymbolShape kind={dinoSymbol(dino)} color="#fff" size={0.42} />
        </g>
      </g>
      <text x="62" y="86" fontSize="15" fontWeight="800" fill="#fff4d8" textAnchor="middle" stroke="#4b2f17" strokeWidth="3" paintOrder="stroke">
        SALIDA
      </text>
    </g>
  );
}

export function HomeArt({ dino, dir }: { dino: DinoId; dir: Dir }) {
  const col = DINO_COLORS[dino];
  return (
    <g>
      <Stub dir={dir} />
      <circle cx="50" cy="50" r="37" fill="#7a5230" stroke="#4b2f17" strokeWidth="4" />
      {/* cueva con techo de colores */}
      <path d="M16 70 Q16 28 50 24 Q84 28 84 70 Z" fill="#8c8f97" stroke="#4a4e57" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 46 Q50 14 78 46" fill="none" stroke={col.body} strokeWidth="11" strokeLinecap="round" />
      <path d="M22 46 Q50 14 78 46" fill="none" stroke={col.dark} strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" />
      <path d="M34 70 Q34 48 50 46 Q66 48 66 70 Z" fill="#2a1a0e" />
      <g transform="translate(50 33)">
        <circle r="11" fill="#fff" stroke={col.dark} strokeWidth="3" />
        <SymbolShape kind={dinoSymbol(dino)} color={col.body} size={0.62} />
      </g>
      <text x="50" y="90" fontSize="14" fontWeight="800" fill="#fff4d8" textAnchor="middle" stroke="#4b2f17" strokeWidth="3" paintOrder="stroke">
        REFUGIO
      </text>
    </g>
  );
}

export function PortalArt({ id, dir }: { id: string; dir: Dir }) {
  const s = PORTAL_STYLES[id] ?? PORTAL_STYLES.A;
  return (
    <g>
      <Stub dir={dir} />
      <circle cx="50" cy="50" r="38" fill={s.glow} opacity="0.55" />
      <circle cx="50" cy="50" r="33" fill="#241638" stroke={s.color} strokeWidth="7" />
      <g className="portal-spin" style={{ transformOrigin: '50px 50px' } as CSSProperties}>
        <path d="M50 50 m0 -26 a26 26 0 0 1 22 38 M50 50 m0 22 a22 22 0 0 1 -18 -36 M50 50 m0 -12 a12 12 0 0 1 10 18" fill="none" stroke={s.glow} strokeWidth="4" strokeLinecap="round" />
      </g>
      <g transform="translate(50 50)">
        <circle r="13" fill={s.color} stroke="#fff" strokeWidth="2.5" />
        <SymbolShape kind={s.symbol} color="#fff" size={0.62} />
      </g>
    </g>
  );
}

export function SymbolBadge({ kind, color }: { kind: 'leaf' | 'sun' | 'diamond' | 'star' | 'moon'; color: string }) {
  return (
    <svg viewBox="-20 -20 40 40" width="20" height="20" aria-hidden="true">
      <SymbolShape kind={kind} color={color} size={1.2} />
    </svg>
  );
}

interface DinoProps {
  dino: DinoId;
  mood?: 'wait' | 'walk' | 'oops' | 'happy';
  facing?: 1 | -1;
  moving?: boolean;
}

/** Dinosaurio pequeño y expresivo. Se dibuja centrado en (0, 0), caja de ±50. */
export function DinoArt({ dino, mood = 'wait', facing = 1, moving }: DinoProps) {
  const c = DINO_COLORS[dino];
  const oops = mood === 'oops';
  const happy = mood === 'happy';
  const id = `dino-${dino}`;
  return (
    <g transform={`scale(${facing} 1)`}>
      <defs>
        <radialGradient id={`${id}-body`} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor={c.light} />
          <stop offset="0.55" stopColor={c.body} />
          <stop offset="1" stopColor={c.dark} />
        </radialGradient>
        <linearGradient id={`${id}-belly`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="1" stopColor={c.belly} />
        </linearGradient>
      </defs>
      <ellipse cx="0" cy="38" rx="30" ry="7" fill="#000" opacity="0.22" />
      <g className={moving ? 'dino-walk' : mood === 'wait' ? 'dino-idle' : undefined}>
        {/* cola con púas */}
        <path d="M-20 10 Q-44 16 -50 -4 Q-46 -10 -40 -6 Q-32 4 -18 -4 Z" fill={`url(#${id}-body)`} stroke={c.dark} strokeWidth="3" strokeLinejoin="round" />
        <path d="M-40 4 l-4 -9 l8 3 Z M-30 6 l-3 -9 l8 4 Z" fill={c.spike} stroke={c.dark} strokeWidth="1.5" strokeLinejoin="round" />
        {/* patas con dedos */}
        <g className="leg-a">
          <rect x="-15" y="19" width="12" height="18" rx="6" fill={c.dark} />
          <path d="M-17 36 q8 -3 14 0 l0 3 l-14 0 Z" fill={c.dark} stroke="#fff" strokeOpacity="0.25" strokeWidth="1" />
        </g>
        <g className="leg-b">
          <rect x="5" y="19" width="12" height="18" rx="6" fill={c.dark} />
          <path d="M3 36 q8 -3 14 0 l0 3 l-14 0 Z" fill={c.dark} stroke="#fff" strokeOpacity="0.25" strokeWidth="1" />
        </g>
        {/* cuerpo */}
        <ellipse cx="0" cy="8" rx="28" ry="23" fill={`url(#${id}-body)`} stroke={c.dark} strokeWidth="3" />
        <path d="M-4 22 Q6 32 20 18 Q22 6 6 4 Q-10 6 -4 22 Z" fill={`url(#${id}-belly)`} />
        {[-6, 2, 10].map((y) => <path key={y} d={`M6 ${y + 14} q8 3 14 -1`} stroke={c.belly} strokeOpacity="0.9" strokeWidth="1.4" fill="none" strokeLinecap="round" transform="translate(0 2)" />)}
        {/* manchas */}
        <circle cx="-14" cy="2" r="4" fill={c.spot} opacity="0.7" />
        <circle cx="-6" cy="-6" r="2.6" fill={c.spot} opacity="0.7" />
        <circle cx="-18" cy="14" r="2.8" fill={c.spot} opacity="0.7" />
        {/* bracito */}
        <path d="M10 10 q8 2 9 9 q-6 2 -10 -3 Z" fill={c.body} stroke={c.dark} strokeWidth="2" strokeLinejoin="round" />
        {/* púas de la espalda */}
        {[-18, -7, 4].map((x, i) => (
          <path key={x} d={`M${x} -13 l${5 + (i === 1 ? 1 : 0)} -${11 + i} l5 ${11 + i} Z`} fill={c.spike} stroke={c.dark} strokeWidth="1.8" strokeLinejoin="round" />
        ))}
        {/* cabeza */}
        <path d="M-2 -10 Q-2 -34 18 -34 Q40 -32 42 -12 Q42 2 28 3 Q10 6 -2 -10 Z" fill={`url(#${id}-body)`} stroke={c.dark} strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="30" cy="-6" rx="11" ry="8" fill={`url(#${id}-belly)`} opacity="0.95" />
        <circle cx="35" cy="-10" r="1.5" fill={c.dark} opacity="0.7" />
        <circle cx="30" cy="-11" r="1.5" fill={c.dark} opacity="0.7" />
        {/* ojo */}
        <g className="dino-eye">
          <ellipse cx="21" cy="-20" rx="8" ry={oops ? 8.8 : 8} fill="#fff" stroke="#2b2b2b" strokeWidth="1.8" />
          <circle cx={oops ? 19.5 : 23} cy={oops ? -18.5 : -20} r="4.4" fill="#1d1d1d" />
          <circle cx={oops ? 20.5 : 24.4} cy={oops ? -20 : -21.8} r="1.7" fill="#fff" />
          <circle cx={oops ? 18 : 21.5} cy={oops ? -16.5 : -18} r="0.9" fill="#fff" opacity="0.8" />
        </g>
        {/* ceja, boca y mejilla */}
        {oops ? (
          <>
            <path d="M12 -31 L27 -27" stroke={c.dark} strokeWidth="3" strokeLinecap="round" />
            <path d="M26 -1 q6 -4 12 0" stroke="#7a2b12" strokeWidth="2.8" fill="none" strokeLinecap="round" />
            <path d="M38 -30 q5 7 0 11 q-5 -4 0 -11" fill="#7fd0ff" stroke="#2c86b8" strokeWidth="1" />
          </>
        ) : happy ? (
          <>
            <path d="M14 -30 Q21 -34 28 -30" stroke={c.dark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M24 -4 q9 12 18 0 Z" fill="#8a2b1a" stroke="#7a2b12" strokeWidth="2" strokeLinejoin="round" />
            <path d="M28 2 q5 4 10 0 q-5 -2 -10 0 Z" fill="#ff7b86" />
          </>
        ) : (
          <>
            <path d="M14 -30 Q21 -33 28 -29" stroke={c.dark} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M25 -2 q7 5 14 0" stroke="#7a2b12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </>
        )}
        <ellipse cx="11" cy="-8" rx="4.6" ry="3.2" fill="#ff8f9a" opacity="0.6" />
        {/* brillo */}
        <path d="M2 -26 Q10 -34 20 -33" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

export function BombDef() {
  return (
    <g id="bomb-def">
      <circle cx="50" cy="58" r="27" fill="#2c2a33" stroke="#0e0d12" strokeWidth="4" />
      <ellipse cx="41" cy="48" rx="8" ry="5" fill="#fff" opacity="0.28" transform="rotate(-30 41 48)" />
      <rect x="42" y="25" width="16" height="9" rx="3" fill="#55525e" stroke="#0e0d12" strokeWidth="3" />
      <path d="M50 25 Q50 12 62 10" stroke="#8a6a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <g transform="translate(62 10)">
        <path d="M0 -9 L2.5 -2.5 L9 0 L2.5 2.5 L0 9 L-2.5 2.5 L-9 0 L-2.5 -2.5 Z" fill="#ffc83d" stroke="#e8692a" strokeWidth="1.5" />
      </g>
    </g>
  );
}

/** Volcán decorativo que queda fuera del tablero. */
export function Volcano({ style }: { style?: CSSProperties }) {
  return (
    <svg className="decor volcano" viewBox="0 0 200 170" style={style} aria-hidden="true">
      <g className="smoke">
        <circle cx="102" cy="26" r="13" fill="#d9d4cf" opacity="0.8" />
        <circle cx="116" cy="12" r="10" fill="#e6e1dc" opacity="0.7" />
        <circle cx="94" cy="8" r="8" fill="#e6e1dc" opacity="0.6" />
      </g>
      <path d="M10 168 L72 52 Q100 40 128 52 L190 168 Z" fill="#7b4f35" stroke="#4a2c1b" strokeWidth="5" strokeLinejoin="round" />
      <path d="M72 52 Q100 66 128 52 Q100 38 72 52 Z" fill="#ff7a2e" stroke="#4a2c1b" strokeWidth="4" />
      <path d="M96 60 Q90 100 76 130 M106 62 Q112 96 126 134" stroke="#ff9d42" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M40 130 L58 100 M150 120 L136 96 M70 152 L88 126" stroke="#5a3722" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Palm({ style, flip }: { style?: CSSProperties; flip?: boolean }) {
  return (
    <svg className="decor palm" viewBox="0 0 120 160" style={{ ...style, transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <path d="M58 158 Q50 100 62 54" stroke="#8a5a2e" strokeWidth="9" fill="none" strokeLinecap="round" />
      <g fill="#3fa14e" stroke="#216a31" strokeWidth="3" strokeLinejoin="round">
        <path d="M62 54 Q30 30 6 50 Q34 40 62 58 Z" />
        <path d="M62 54 Q40 18 18 16 Q44 28 62 54 Z" />
        <path d="M62 54 Q70 14 96 8 Q76 26 62 54 Z" />
        <path d="M62 54 Q94 30 116 50 Q90 42 62 58 Z" />
        <path d="M62 54 Q60 70 40 84 Q56 70 62 54 Z" />
        <path d="M62 54 Q70 72 92 80 Q72 70 62 54 Z" />
      </g>
      <circle cx="58" cy="60" r="5" fill="#7a4a24" />
      <circle cx="67" cy="62" r="5" fill="#7a4a24" />
    </svg>
  );
}

export function Fern({ style }: { style?: CSSProperties }) {
  return (
    <svg className="decor fern" viewBox="0 0 100 80" style={style} aria-hidden="true">
      <g fill="#4cb35a" stroke="#256e33" strokeWidth="3" strokeLinejoin="round">
        <path d="M50 78 Q20 60 6 24 Q34 38 50 78 Z" />
        <path d="M50 78 Q50 40 48 6 Q64 40 50 78 Z" />
        <path d="M50 78 Q80 60 94 24 Q66 38 50 78 Z" />
        <path d="M50 78 Q30 66 18 50 Q40 56 50 78 Z" fill="#62c46c" />
        <path d="M50 78 Q70 66 82 50 Q60 56 50 78 Z" fill="#62c46c" />
      </g>
    </svg>
  );
}

/** Dibujo de una pieza para la bandeja y la ayuda. */
export function PieceIcon({ type, rot = 0, arrow = 'stem', size = 64 }: { type: PieceType; rot?: number; arrow?: TeeArrow; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="96" height="96" rx="10" fill="#c98f55" stroke="#8a5a2d" strokeWidth="3" />
      <TileArt type={type} rot={rot} arrow={arrow} />
    </svg>
  );
}
