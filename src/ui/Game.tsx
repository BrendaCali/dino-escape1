import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { GameSession } from '../game/session';
import type { ExitConfig, Level, PieceType } from '../game/types';
import { PIECE_TYPES } from '../game/types';
import { applyCompletion, pendingReward } from '../rewards/rewardRules';
import type { CompletionResult, RewardLedger } from '../rewards/rewardRules';
import { play } from '../platform/sound';
import { BoardView } from './Board';
import { DINO_COLORS, DinoArt, Fern, Palm, PieceIcon, Volcano } from './art';
import { isEditable } from '../game/engine';

const PIECE_NAMES: Record<PieceType, string> = { straight: 'Recta', curve: 'Curva', tee: 'Cruce en T', bridge: 'Puente' };
const PIECE_KEYS: Record<string, PieceType> = { '1': 'straight', '2': 'curve', '3': 'tee', '4': 'bridge' };

export const fmtTime = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const defaultCell = (n: number) => (n <= 6 ? 76 : n <= 8 ? 66 : n <= 10 ? 56 : n <= 12 ? 48 : n <= 15 ? 42 : n <= 20 ? 36 : 34);

export interface GameProps {
  level: Level;
  ledger: RewardLedger;
  completedBefore: boolean;
  dev: boolean;
  reducedMotion: boolean;
  hasNext: boolean;
  onComplete: (levelId: number, usedSec: number, r: CompletionResult) => void;
  onExit: () => void;
  onNext: () => void;
  onRetry: () => void;
  onHelp: () => void;
  /** Modo carrera de sala: sin premio individual; avisa al ganar. */
  race?: { onWin: () => void; step: number };
  /** Partida sin DINO (práctica o desafío comunitario): no hay premio por nivel. */
  free?: { label: string; sub: string; onWin?: (usedSec: number, failed: number) => void };
  /** Partida controlada por el servidor (duelo o evento): el cronómetro arranca en su inicio común. */
  online?: {
    elapsedMs: number;
    label: string;
    sub: string;
    onPhase?: (p: 'building' | 'running') => void;
    onFinish: (sub: { placements: { x: number; y: number; type: PieceType; rot: number }[]; exit: ExitConfig }) => void;
  };
}

export function Game({ level, ledger, completedBefore, dev, reducedMotion, hasNext, onComplete, onExit, onNext, onRetry, onHelp, race, free, online }: GameProps) {
  const [session] = useState(() => new GameSession(level, { claimed: completedBefore, reducedMotion }));
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const n = level.size;
  const [cellPx, setCellPx] = useState(() => defaultCell(n));
  const [panMode, setPanMode] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [reward, setReward] = useState<CompletionResult | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const handled = useRef(false);
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;
  const prev = useRef({ phase: snap.phase, fails: 0, explosion: 0, bombs: 0 });

  session.setReducedMotion(reducedMotion);

  // Único bucle de animación; se cancela al desmontar o reiniciar.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      session.update(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      session.dispose();
    };
  }, [session]);

  // Sonidos por transiciones de estado
  useEffect(() => {
    const p = prev.current;
    if (snap.failedAttempts > p.fails) play('error');
    if (snap.phase === 'celebrating' && p.phase !== 'celebrating') play('win');
    if (snap.phase === 'losing' && p.phase !== 'losing') play('error');
    prev.current = { phase: snap.phase, fails: snap.failedAttempts, explosion: snap.explosion, bombs: 0 };
  }, [snap.phase, snap.failedAttempts, snap.explosion]);

  // Teletransportes: sonido al cruzar un portal
  const lastPortalStep = useRef(-1);
  useEffect(() => {
    if (!snap.sim || snap.phase !== 'running') {
      lastPortalStep.current = -1;
      return;
    }
    for (const d of level.dinos) {
      const tr = snap.sim.traces[d]!;
      const i = Math.floor(snap.runTick - (snap.sim.starts[d] ?? 0));
      if (i >= 0 && tr.steps[i + 1]?.teleport && lastPortalStep.current !== i * 10 + (d === 'green' ? 1 : 2)) {
        lastPortalStep.current = i * 10 + (d === 'green' ? 1 : 2);
        play('portal');
      }
    }
  }, [snap.runTick, snap.phase, snap.sim, level.dinos]);

  // Premio: se calcula una sola vez al ganar
  useEffect(() => {
    if (snap.phase === 'won' && snap.result && !handled.current) {
      handled.current = true;
      const r = snap.result;
      if (race) {
        race.onWin();
        return;
      }
      if (free) {
        const none: CompletionResult = { ledger: ledgerRef.current, awarded: 0, alreadyClaimed: true };
        setReward(none);
        onComplete(level.id, r.usedSec, none);
        free.onWin?.(r.usedSec, r.failedAttempts);
        return;
      }
      const out = applyCompletion(ledgerRef.current, {
        levelId: level.id,
        remainingSec: r.remainingSec,
        totalSec: level.timeSec,
        failedAttempts: r.failedAttempts,
        dinosRescued: r.dinosRescued,
      });
      setReward(out);
      onComplete(level.id, r.usedSec, out);
    }
  }, [snap.phase, snap.result, level, onComplete, race, free]);

  const now = () => performance.now();

  // Partida en línea: arranca con el tiempo ya transcurrido desde el inicio fijado por el servidor
  useEffect(() => {
    if (online) session.begin(performance.now() - online.elapsedMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  const sentPhase = useRef('');
  useEffect(() => {
    if (!online) return;
    const p = snap.phase === 'running' ? 'running' : snap.phase === 'building' || snap.phase === 'failing' ? 'building' : null;
    if (p && sentPhase.current !== p) {
      sentPhase.current = p;
      online.onPhase?.(p);
    }
  }, [snap.phase, online]);
  const sentFinish = useRef(false);
  useEffect(() => {
    if (!online || sentFinish.current || (snap.phase !== 'celebrating' && snap.phase !== 'won')) return;
    sentFinish.current = true;
    const placements: { x: number; y: number; type: PieceType; rot: number }[] = [];
    snap.board.forEach((t, i) => t && placements.push({ x: i % level.size, y: Math.floor(i / level.size), type: t.type, rot: t.rot }));
    online.onFinish({ placements, exit: snap.exit });
  }, [snap.phase, snap.board, snap.exit, online, level.size]);

  const begin = () => {
    play('click');
    session.begin(now());
  };
  const rotate = useCallback((d: 1 | -1) => {
    session.rotate(d);
    play('rotate');
  }, [session]);

  const onCell = (x: number, y: number, secondary: boolean) => {
    if (!isEditable(level, x, y) && snap.phase === 'building') {
      play('error');
      return;
    }
    if (secondary) {
      const tool = session.tool;
      session.setTool('remove');
      const ok = session.placeAt(x, y, now());
      session.setTool(tool);
      if (ok) play('remove');
      return;
    }
    const wasRemove = session.tool === 'remove' || !session.sel;
    if (session.placeAt(x, y, now())) play(wasRemove ? 'remove' : 'place');
  };
  const onDropPiece = (type: PieceType, x: number, y: number) => {
    session.select(type);
    if (session.placeAt(x, y, now())) play('place');
    setHover(null);
  };
  const choose = (t: PieceType) => {
    if (snap.sel?.type === t) session.select(null);
    else if (snap.left[t] > 0) session.select(t);
    play('click');
  };

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        session.undo();
      } else if (k === 'r' || k === 'e') rotate(1);
      else if (k === 'q') rotate(-1);
      else if (k === 'x') session.setTool(session.tool === 'remove' ? 'place' : 'remove');
      else if (k === 'escape') session.select(null);
      else if (PIECE_KEYS[k] && session.snapshot().left[PIECE_KEYS[k]] > 0) session.select(PIECE_KEYS[k]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, rotate]);

  // Zoom y desplazamiento
  const zoom = (f: number) => setCellPx((c) => Math.round(Math.min(120, Math.max(14, c * f))));
  const fit = () => {
    const st = stageRef.current;
    if (st) setCellPx(Math.max(14, Math.floor(Math.min(st.clientWidth - 48, window.innerHeight * 0.7) / n)));
  };
  const scrollBy = (dx: number, dy: number) => viewport.current?.scrollBy({ left: dx, top: dy, behavior: reducedMotion ? 'auto' : 'smooth' });
  const onPanDown = (e: RPointerEvent) => {
    if (!panMode || !viewport.current) return;
    viewport.current.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, sl: viewport.current.scrollLeft, st: viewport.current.scrollTop };
  };
  const onPanMove = (e: RPointerEvent) => {
    if (!drag.current || !viewport.current) return;
    viewport.current.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    viewport.current.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  };
  const onPanUp = () => {
    drag.current = null;
  };

  const phase = snap.phase;
  const claimed = completedBefore || ledger.claimed[level.id] !== undefined;
  const potential = pendingReward(snap.remainingSec, level.timeSec, snap.failedAttempts);
  const lowTime = snap.remainingSec <= level.timeSec * 0.15 && phase !== 'ready';
  const canEdit = phase === 'building';
  const two = level.dinos.length === 2;
  const objective = two
    ? 'Lleva al dino verde y al naranja a sus refugios (mismo símbolo). Los dos deben llegar.'
    : 'Lleva al dino verde a su refugio antes de que se acabe el tiempo.';
  const startsAt = snap.sim ? snap.sim.starts : {};

  return (
    <div className={`game${panMode ? ' pan-mode' : ''}${lowTime ? ' low-time' : ''}`}>
      <header className="hud">
        <button className="btn ghost" onClick={() => { play('click'); onExit(); }} aria-label="Volver a los niveles">← Niveles</button>
        <div className="hud-title">
          <span className="hud-level">{race ? `Reto ${race.step} de 9` : `Nivel ${level.id}`}</span>
          <strong>{level.name}</strong>
        </div>
        <div className={`hud-chip timer${lowTime ? ' warn' : ''}`} aria-label="Tiempo restante">
          <span className="hud-label">Tiempo</span>
          <span className="hud-value" role="timer">{fmtTime(snap.remainingSec)}</span>
        </div>
        {!race && (free || online) && <div className="hud-chip reward" title="Esta partida no gana ni pierde DINO">
          <span className="hud-label">{(free ?? online)!.label}</span>
          <span className="hud-value">{online ? 'En línea' : '0 DINO'}</span>
          <span className="hud-sub">{(free ?? online)!.sub}</span>
        </div>}
        {!race && !free && !online && <div className="hud-chip reward" title="Premio de prueba si completas ahora">
          <span className="hud-label">Recompensa potencial</span>
          <span className="hud-value">{claimed ? 'Práctica' : `${potential.toFixed(1)} DINO`}</span>
          <span className="hud-sub">{claimed ? 'ya cobrado · sin premio' : 'DINO de prueba'}</span>
        </div>}
        <div className="hud-chip">
          <span className="hud-label">Intentos fallidos</span>
          <span className="hud-value">{snap.failedAttempts}</span>
        </div>
        <button className="btn ghost round" onClick={onHelp} aria-label="Cómo jugar">?</button>
      </header>

      <p className="objective">
        <strong>Objetivo:</strong> {objective}
      </p>

      <div className="play-area">
        <section className="stage" ref={stageRef} aria-label="Zona de juego">
          <Volcano style={{ position: 'absolute', right: -6, top: -78, width: 170 }} />
          <Palm style={{ position: 'absolute', left: -34, bottom: -18, width: 86 }} />
          <Fern style={{ position: 'absolute', right: 8, bottom: -26, width: 90 }} />
          <Fern style={{ position: 'absolute', left: 30, top: -34, width: 72 }} />
          <div className="status-line" aria-live="polite">
            {phase === 'failing' && snap.marker && (
              <div className="banner error" role="alert">
                <strong>¡Intento fallido!</strong> {snap.marker.message}
                <span className="muted-on-dark"> Los dinos vuelven a la salida; tus piezas se quedan.</span>
              </div>
            )}
            {phase === 'running' && <div className="banner info" role="status">¡Los dinosaurios corren!</div>}
            {phase === 'losing' && <div className="banner error" role="alert">¡Se acabó el tiempo!</div>}

          </div>
          <div
            ref={viewport}
            className={`viewport${panMode ? ' pan' : ''}`}
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanUp}
            onPointerCancel={onPanUp}
          >
            <BoardView
              level={level}
              snap={snap}
              cellPx={cellPx}
              panMode={panMode}
              hover={hover}
              onHover={setHover}
              onCell={onCell}
              onDropPiece={onDropPiece}
            />
          </div>

          {phase === 'ready' && (
            <div className="overlay ready" role="dialog" aria-label="Comenzar nivel">
              <div className="card">
                <h2>Nivel {level.id}: {level.name}</h2>
                <p>{level.note}</p>
                <ul className="facts">
                  <li>Tablero {n} × {n}</li>
                  <li>Tiempo: {fmtTime(level.timeSec)}</li>
                  <li>{two ? '2 dinosaurios' : '1 dinosaurio'}</li>
                </ul>
                <p className="muted">El cronómetro empieza al pulsar el botón. Los dinos esperan en su salida mientras construyes.</p>
                <button className="btn primary big" onClick={begin} autoFocus>Comenzar nivel</button>
              </div>
            </div>
          )}

          <div className="view-controls" role="group" aria-label="Controles de la vista">
            <button className="btn small" onClick={() => zoom(1 / 1.25)} aria-label="Alejar">−</button>
            <button className="btn small" onClick={() => zoom(1.25)} aria-label="Acercar">+</button>
            <button className="btn small" onClick={fit}>Ajustar</button>
            <button className={`btn small${panMode ? ' on' : ''}`} onClick={() => setPanMode((v) => !v)} aria-pressed={panMode}>
              ✋ Mover vista
            </button>
            <span className="pad">
              <button className="btn small" onClick={() => scrollBy(-160, 0)} aria-label="Desplazar a la izquierda">◀</button>
              <button className="btn small" onClick={() => scrollBy(0, -160)} aria-label="Desplazar arriba">▲</button>
              <button className="btn small" onClick={() => scrollBy(0, 160)} aria-label="Desplazar abajo">▼</button>
              <button className="btn small" onClick={() => scrollBy(160, 0)} aria-label="Desplazar a la derecha">▶</button>
            </span>
          </div>
        </section>

        <aside className="panel" aria-label="Piezas y controles">
          <h3>Piezas</h3>
          <div className="tray" role="group" aria-label="Inventario">
            {PIECE_TYPES.filter((t) => level.inventory[t] > 0).map((t, i) => {
              const sel = snap.sel?.type === t;
              const left = snap.left[t];
              return (
                <button
                  key={t}
                  className={`piece${sel ? ' selected' : ''}`}
                  disabled={!canEdit || (left <= 0 && !sel)}
                  onClick={() => choose(t)}
                  draggable={canEdit && left > 0}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', t);
                    e.dataTransfer.effectAllowed = 'copy';
                    session.select(t);
                  }}
                  aria-pressed={sel}
                  aria-label={`${PIECE_NAMES[t]}, quedan ${left}`}
                  title={`${PIECE_NAMES[t]} (tecla ${PIECE_TYPES.indexOf(t) + 1})`}
                >
                  <PieceIcon type={t} rot={sel ? snap.sel!.rot : 0} arrow={level.teeArrow} size={58} />
                  <span className="piece-name">{PIECE_NAMES[t]}</span>
                  <span className="piece-count">×{left}</span>
                  <span className="sr-only">{i}</span>
                </button>
              );
            })}
          </div>

          <div className="row" role="group" aria-label="Giro">
            <button className="btn" disabled={!snap.sel} onClick={() => rotate(-1)} aria-label="Girar a la izquierda">↺ Izquierda</button>
            <button className="btn" disabled={!snap.sel} onClick={() => rotate(1)} aria-label="Girar a la derecha">↻ Derecha</button>
          </div>
          <div className="row">
            <button className={`btn${snap.tool === 'remove' ? ' on' : ''}`} disabled={!canEdit} onClick={() => { session.setTool(snap.tool === 'remove' ? 'place' : 'remove'); play('click'); }} aria-pressed={snap.tool === 'remove'}>
              Recuperar pieza
            </button>
          </div>
          <div className="row">
            <button className="btn" disabled={!canEdit || !snap.canUndo} onClick={() => { session.undo(); play('remove'); }}>↶ Deshacer</button>
            <button className="btn" disabled={!canEdit} onClick={() => { session.clear(); play('remove'); }}>Limpiar</button>
          </div>
          <p className="tiny">Deshacer y Limpiar no devuelven tiempo ni recompensa. Clic derecho o «Recuperar» quitan una pieza.</p>

          {two && (
            <div className="exit-box">
              <h3>Orden de salida</h3>
              <div className="row" role="group" aria-label="Quién sale primero">
                {level.dinos.map((d) => (
                  <button key={d} className={`btn dino-btn${snap.exit.first === d ? ' on' : ''}`} disabled={!canEdit} onClick={() => session.setExit({ first: d })} aria-pressed={snap.exit.first === d}>
                    <svg viewBox="-50 -50 100 100" width="30" height="30" aria-hidden="true"><DinoArt dino={d} /></svg>
                    {d === 'green' ? 'Verde' : 'Naranja'} primero
                  </button>
                ))}
              </div>
              <label className="field">
                <span>El segundo sale</span>
                <select
                  value={String(snap.exit.delay)}
                  disabled={!canEdit}
                  onChange={(e) => session.setExit({ delay: e.target.value === 'after' ? 'after' : Number(e.target.value) })}
                >
                  <option value="after">Después de que llegue el primero</option>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} s después</option>
                  ))}
                </select>
              </label>
              <p className="tiny">Llegar antes ahorra tiempo (más premio). Si dos dinos coinciden en una casilla, chocan; en un puente por ejes distintos no.</p>
            </div>
          )}

          <button className="btn primary big run" disabled={!canEdit} onClick={() => { play('run'); session.run(now()); }}>
            ¡Corre, Dino!
          </button>

          <div className="legend">
            <span><i className="sw edit" /> Casilla libre</span>
            <span><i className="sw fixed" /> Fija / bloqueada</span>
          </div>

          {dev && (
            <div className="dev-box">
              <h3>Modo desarrollo</h3>
              <button className="btn small" disabled={!canEdit} onClick={() => session.showSolution()}>Colocar solución</button>
              <button className="btn small" onClick={() => setShowSolution((v) => !v)}>{showSolution ? 'Ocultar' : 'Ver'} solución (JSON)</button>
              {showSolution && <pre className="json">{JSON.stringify(level.solution)}</pre>}
              <p className="tiny">
                Salidas: {level.dinos.map((d) => `${DINO_COLORS[d].name} @${startsAt[d] ?? 0}`).join(' · ')}
              </p>
            </div>
          )}
        </aside>
      </div>

      {!online && (phase === 'won' || phase === 'lost') && (
        <div className="overlay result" role="dialog" aria-label="Resultado">
          <div className="card big-card">
            {phase === 'won' && snap.result ? (
              <>
                <svg viewBox="-50 -50 100 100" width="120" height="120" className="result-dino" aria-hidden="true">
                  <DinoArt dino="green" mood="happy" />
                </svg>
                <h2>{race ? '¡Reto superado!' : '¡Nivel superado!'}</h2>
                <dl className="stats">
                  <div><dt>Tiempo utilizado</dt><dd>{fmtTime(snap.result.usedSec)}</dd></div>
                  <div><dt>Intentos fallidos</dt><dd>{snap.result.failedAttempts}</dd></div>
                  {!race && <div>
                    <dt>Recompensa de prueba</dt>
                    <dd>{free ? '0 · partida gratis' : reward ? (reward.alreadyClaimed ? '0 · ya cobrado' : `+${reward.awarded.toFixed(1)} DINO`) : '…'}</dd>
                  </div>}
                </dl>
                <p className="muted">DINO de prueba: valores simulados, sin valor real.</p>
              </>
            ) : (
              <>
                <svg viewBox="-50 -50 100 100" width="120" height="120" className="result-dino" aria-hidden="true">
                  <DinoArt dino="green" mood="oops" />
                </svg>
                <h2>¡Se acabó el tiempo!</h2>
                <dl className="stats">
                  <div><dt>Tiempo utilizado</dt><dd>{fmtTime(level.timeSec)}</dd></div>
                  <div><dt>Intentos fallidos</dt><dd>{snap.failedAttempts}</dd></div>
                  {!race && <div><dt>Recompensa de prueba</dt><dd>0 DINO (sin premio)</dd></div>}
                </dl>
              </>
            )}
            <div className="row center">
              {phase === 'won' && hasNext && <button className="btn primary big" onClick={onNext}>{race ? (race.step >= 9 ? 'Terminar' : 'Siguiente reto') : 'Siguiente nivel'}</button>}
              <button className="btn big" onClick={onRetry}>Reintentar</button>
              <button className="btn big" onClick={onExit}>{race ? 'Salir de la sala' : 'Volver a niveles'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
