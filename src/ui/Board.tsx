import { memo, useRef } from 'react';
import type { DragEvent, MouseEvent, PointerEvent } from 'react';
import { DX, DY } from '../game/geometry';
import { cellMap, isEditable, poseAt } from '../game/engine';
import type { Snapshot } from '../game/session';
import type { Board as BoardData, DinoId, Level, PieceType } from '../game/types';
import { DINO_COLORS, DinoArt, HomeArt, PortalArt, RockArt, StartArt, TileArt } from './art';

const hash = (x: number, y: number) => (x * 73856093) ^ (y * 19349663);

const Ground = memo(function Ground({ level }: { level: Level }) {
  const n = level.size;
  const cm = cellMap(level);
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const blocked = cm.has(y * n + x);
      const h = Math.abs(hash(x, y));
      cells.push(
        <g key={`${x},${y}`} transform={`translate(${x * 100} ${y * 100})`}>
          <rect width="100" height="100" fill={blocked ? '#8f6238' : (x + y) % 2 ? '#d49c62' : '#cc9459'} />
          {!blocked && <rect x="7" y="7" width="86" height="86" rx="9" fill="none" stroke="#f1c690" strokeWidth="2.5" strokeDasharray="6 8" opacity="0.7" />}
          {!blocked && h % 7 === 0 && <circle cx={20 + (h % 60)} cy={24 + ((h >> 3) % 55)} r="3.2" fill="#a7743f" />}
          {!blocked && h % 11 === 0 && <path d={`M${70 - (h % 20)} 86 q4 -14 8 0 M${76 - (h % 20)} 86 q2 -10 6 0`} stroke="#6aa85a" strokeWidth="3" fill="none" strokeLinecap="round" />}
        </g>,
      );
    }
  return (
    <g>
      {cells}
      <path
        d={Array.from({ length: n + 1 }, (_, i) => `M${i * 100} 0 V${n * 100} M0 ${i * 100} H${n * 100}`).join(' ')}
        stroke="#6f4423"
        strokeWidth="3"
        fill="none"
      />
    </g>
  );
});

const Fixed = memo(function Fixed({ level }: { level: Level }) {
  const arrow = level.teeArrow;
  return (
    <g>
      {level.fixed.map((f) => (
        <g key={`f${f.x},${f.y}`} transform={`translate(${f.x * 100} ${f.y * 100})`}>
          <TileArt type={f.type} rot={f.rot} fixed arrow={arrow} />
        </g>
      ))}
      {level.rocks.map((r) => (
        <g key={`r${r.x},${r.y}`} transform={`translate(${r.x * 100} ${r.y * 100})`}>
          <RockArt seed={Math.abs(hash(r.x, r.y))} />
        </g>
      ))}
      {level.starts.map((s) => (
        <g key={`s${s.dino}`} transform={`translate(${s.x * 100} ${s.y * 100})`}>
          <StartArt dino={s.dino} dir={s.dir} />
        </g>
      ))}
      {level.homes.map((h) => (
        <g key={`h${h.dino}`} transform={`translate(${h.x * 100} ${h.y * 100})`}>
          <HomeArt dino={h.dino} dir={h.dir} />
        </g>
      ))}
      {level.portals.flatMap((p) =>
        [p.a, p.b].map((q, i) => (
          <g key={`p${p.id}${i}`} transform={`translate(${q.x * 100} ${q.y * 100})`}>
            <PortalArt id={p.id} dir={q.dir} />
          </g>
        )),
      )}
    </g>
  );
});

const Tiles = memo(function Tiles({ level, board }: { level: Level; board: BoardData }) {
  const n = level.size;
  const out = [];
  for (let i = 0; i < board.length; i++) {
    const t = board[i];
    if (!t) continue;
    const x = i % n;
    const y = Math.floor(i / n);
    out.push(
      <g key={`${i}-${t.type}-${t.rot}`} transform={`translate(${x * 100} ${y * 100})`}>
        <g className="pop">
          <TileArt type={t.type} rot={t.rot} arrow={level.teeArrow} />
        </g>
      </g>,
    );
  }
  return <g>{out}</g>;
});

export interface BoardProps {
  level: Level;
  snap: Snapshot;
  cellPx: number;
  panMode: boolean;
  hover: { x: number; y: number } | null;
  onHover: (p: { x: number; y: number } | null) => void;
  onCell: (x: number, y: number, secondary: boolean) => void;
  onDropPiece: (type: PieceType, x: number, y: number) => void;
}

export function BoardView({ level, snap, cellPx, panMode, hover, onHover, onCell, onDropPiece }: BoardProps) {
  const n = level.size;
  const ref = useRef<SVGSVGElement>(null);

  const cellFrom = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.floor(((cx - r.left) / r.width) * n);
    const y = Math.floor(((cy - r.top) / r.height) * n);
    return x >= 0 && y >= 0 && x < n && y < n ? { x, y } : null;
  };

  const onClick = (e: MouseEvent) => {
    if (panMode) return;
    const c = cellFrom(e.clientX, e.clientY);
    if (c) onCell(c.x, c.y, false);
  };
  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    if (panMode) return;
    const c = cellFrom(e.clientX, e.clientY);
    if (c) onCell(c.x, c.y, true);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || panMode) return;
    const c = cellFrom(e.clientX, e.clientY);
    if (!c) onHover(null);
    else if (!hover || hover.x !== c.x || hover.y !== c.y) onHover(c);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const c = cellFrom(e.clientX, e.clientY);
    if (c && (!hover || hover.x !== c.x || hover.y !== c.y)) onHover(c);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const t = e.dataTransfer.getData('text/plain') as PieceType;
    const c = cellFrom(e.clientX, e.clientY);
    if (c && ['straight', 'curve', 'tee', 'bridge'].includes(t)) onDropPiece(t, c.x, c.y);
  };

  const sim = snap.sim;
  const tick = snap.runTick;
  const losing = snap.phase === 'losing' || snap.phase === 'lost';
  const dinos = level.dinos.map((d: DinoId) => {
    if (sim) return { d, pose: poseAt(sim, level, d, tick) };
    const s = level.starts.find((q) => q.dino === d)!;
    return {
      d,
      pose: { x: s.x, y: s.y, scale: 1, visible: true, facing: (s.dir === 3 ? -1 : 1) as 1 | -1, mood: losing ? ('oops' as const) : ('wait' as const), moving: false },
    };
  });

  const m = snap.marker;
  const canGhost = hover && snap.phase === 'building' && isEditable(level, hover.x, hover.y);
  const hoverTile = hover ? snap.board[hover.y * n + hover.x] : null;

  return (
    <svg
      ref={ref}
      className={`board-svg${panMode ? ' pan' : ''}`}
      viewBox={`0 0 ${n * 100} ${n * 100}`}
      width={n * cellPx}
      height={n * cellPx}
      onClick={onClick}
      onContextMenu={onContext}
      onPointerMove={onMove}
      onPointerLeave={() => onHover(null)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      role="img"
      aria-label={`Tablero de ${n} por ${n}`}
    >
      <Ground level={level} />
      <Fixed level={level} />
      <Tiles level={level} board={snap.board} />

      {canGhost && snap.tool === 'place' && snap.sel && (
        <g transform={`translate(${hover!.x * 100} ${hover!.y * 100})`} pointerEvents="none">
          <TileArt type={snap.sel.type} rot={snap.sel.rot} arrow={level.teeArrow} ghost bad={snap.left[snap.sel.type] <= 0 && !(hoverTile && hoverTile.type === snap.sel.type)} />
        </g>
      )}
      {canGhost && (snap.tool === 'remove' || !snap.sel) && hoverTile && (
        <rect x={hover!.x * 100 + 4} y={hover!.y * 100 + 4} width="92" height="92" rx="10" fill="none" stroke={snap.tool === 'remove' ? '#e23b3b' : '#fff'} strokeWidth="5" strokeDasharray="10 8" pointerEvents="none" />
      )}
      {hover && snap.phase === 'building' && !isEditable(level, hover.x, hover.y) && snap.sel && (
        <g transform={`translate(${hover.x * 100} ${hover.y * 100})`} pointerEvents="none">
          <rect x="6" y="6" width="88" height="88" rx="10" fill="#e23b3b" opacity="0.28" />
          <path d="M30 30 L70 70 M70 30 L30 70" stroke="#e23b3b" strokeWidth="9" strokeLinecap="round" />
        </g>
      )}

      {m && (
        <g pointerEvents="none">
          {m.type === 'fail' && m.toward !== undefined ? (
            <>
              <rect x={m.x * 100 + 3} y={m.y * 100 + 3} width="94" height="94" rx="10" fill="none" stroke="#e23b3b" strokeWidth="6" strokeDasharray="12 8" className="pulse" />
              <g transform={`translate(${m.x * 100 + 50 + DX[m.toward] * 50} ${m.y * 100 + 50 + DY[m.toward] * 50})`}>
                <circle r="24" fill="#e23b3b" stroke="#fff" strokeWidth="5" className="pulse" />
                <path d="M-10 -10 L10 10 M10 -10 L-10 10" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
              </g>
            </>
          ) : (
            <g transform={`translate(${m.x * 100 + 50} ${m.y * 100 + 50})`} className="pulse">
              <circle r="34" fill="#ffd36b" stroke="#e8a02a" strokeWidth="5" />
              <text y="9" textAnchor="middle" fontSize="26" fontWeight="800" fill="#7a4a0f">¡Ups!</text>
            </g>
          )}
        </g>
      )}

      {dinos.map(({ d, pose }) =>
        pose.visible ? (
          <g key={d} transform={`translate(${pose.x * 100 + 50} ${pose.y * 100 + 52}) scale(${0.92 * pose.scale})`} pointerEvents="none">
            <DinoArt dino={d} mood={pose.mood} facing={pose.facing} moving={pose.moving} />
          </g>
        ) : null,
      )}

      {snap.phase === 'celebrating' &&
        level.homes.map((h) => (
          <g key={`c${h.dino}`} transform={`translate(${h.x * 100 + 50} ${h.y * 100 + 50})`} pointerEvents="none">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <path className="spark" d="M0 -48 l5 12 h-10 z" fill={DINO_COLORS[h.dino].body} stroke="#fff" strokeWidth="2" />
              </g>
            ))}
          </g>
        ))}

      {losing && <rect width={n * 100} height={n * 100} fill="#1d2a3a" opacity={snap.bombProgress * 0.45} pointerEvents="none" />}
    </svg>
  );
}
