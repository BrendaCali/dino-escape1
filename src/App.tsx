import { useCallback, useEffect, useMemo, useState } from 'react';
import { LEVELS, getLevel } from './levels';
import { Game, fmtTime } from './ui/Game';
import { DuelScreen } from './ui/Duel';
import { ShelterScreen } from './ui/Shelter';
import { EventScreen } from './ui/Event';
import { WalletScreen } from './ui/Wallet';
import { ProtoBadge, fmtD, useNet } from './ui/common';
import { DINO_COLORS, DinoArt, Fern, Palm, PieceIcon, PORTAL_STYLES, SymbolBadge, Volcano } from './ui/art';
import { clearSaved, loadSaved, save } from './platform/storage';
import type { Saved } from './platform/storage';
import { play, setSound } from './platform/sound';
import { emptyLedger } from './rewards/rewardRules';
import type { CompletionResult } from './rewards/rewardRules';
import { net } from './net/client';

type Screen =
  | { name: 'start' }
  | { name: 'levels' }
  | { name: 'game'; levelId: number; attempt: number }
  | { name: 'duel'; code?: string }
  | { name: 'shelter' }
  | { name: 'event' }
  | { name: 'wallet' };

const useReducedMotionQuery = () => {
  const [v, setV] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const f = () => setV(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return v;
};

export default function App() {
  const [saved, setSaved] = useState<Saved>(() => loadSaved());
  const [screen, setScreen] = useState<Screen>(() => {
    const code = new URLSearchParams(location.search).get('room');
    return code ? { name: 'duel', code: code.toUpperCase().slice(0, 5) } : { name: 'start' };
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const osReduce = useReducedMotionQuery();
  const reduce = saved.prefs.reduceMotion || osReduce;
  const n = useNet();

  useEffect(() => {
    save(saved);
    setSound(saved.prefs.sound, saved.prefs.volume);
  }, [saved]);
  useEffect(() => {
    net.start(saved.name, saved.prefs.dev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prefs = saved.prefs;
  const setPrefs = (p: Partial<Saved['prefs']>) => setSaved((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));
  const unlocked = (id: number) => prefs.dev || id === 1 || saved.completed[id - 1] !== undefined;

  // La práctica solo guarda progreso y mejores tiempos: no mueve DINO ni el refugio.
  const onComplete = useCallback((levelId: number, usedSec: number, _r: CompletionResult) => {
    setSaved((s) => ({
      ...s,
      completed: { ...s.completed, [levelId]: { bestUsedSec: Math.min(s.completed[levelId]?.bestUsedSec ?? Infinity, usedSec) } },
    }));
  }, []);

  const openHelp = () => {
    play('click');
    setHelpOpen(true);
  };
  const go = (s: Screen) => {
    play('click');
    setScreen(s);
  };

  const baseLevel = screen.name === 'game' ? getLevel(screen.levelId) : undefined;
  // Modo desarrollo: ?time=SEGUNDOS acorta el cronómetro de práctica para probar la derrota.
  const level = useMemo(() => {
    if (!baseLevel || !prefs.dev) return baseLevel;
    const t = Number(new URLSearchParams(location.search).get('time'));
    return t > 0 ? { ...baseLevel, timeSec: t } : baseLevel;
  }, [baseLevel, prefs.dev]);

  const w = n.view?.wallet;
  return (
    <div className={`app${reduce ? ' reduce-motion' : ''}`}>
      <div className="topbar">
        <ProtoBadge />
        <button className="balance market-chip" onClick={() => go({ name: 'shelter' })} title="Ver el refugio comunitario">
          🦕 Refugio <strong>{n.view ? n.view.shelter.shownRescues : '–'}/{n.config?.goalRescues ?? 100}</strong>
        </button>
        <button className="balance" onClick={() => go({ name: 'wallet' })} aria-label="Mi saldo de prueba" title="Mi saldo">
          <span className={`dot ${n.status}`} title={n.status === 'online' ? 'Conectado' : 'Sin servidor'} />
          {w ? <>Saldo: <strong>{fmtD(w.available)}</strong>{w.locked > 0 && <> · bloqueado {fmtD(w.locked)}</>} DINO de prueba</> : 'Saldo: sin servidor'}
        </button>
        <button className="btn ghost round" onClick={() => setPrefs({ sound: !prefs.sound })} aria-pressed={prefs.sound} aria-label={prefs.sound ? 'Silenciar sonido' : 'Activar sonido'}>
          {prefs.sound ? '🔊' : '🔇'}
        </button>
        <button className="btn ghost round" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">⚙</button>
      </div>

      {screen.name === 'start' && (
        <StartScreen
          onPlay={() => go({ name: 'levels' })}
          onDuel={() => go({ name: 'duel' })}
          onShelter={() => go({ name: 'shelter' })}
          onEvent={() => go({ name: 'event' })}
          onWallet={() => go({ name: 'wallet' })}
          onHelp={openHelp}
        />
      )}

      {screen.name === 'levels' && (
        <LevelSelect saved={saved} unlocked={unlocked} dev={prefs.dev} onPick={(id) => go({ name: 'game', levelId: id, attempt: 0 })} onBack={() => go({ name: 'start' })} />
      )}

      {screen.name === 'game' && level && (
        <Game
          key={`${level.id}-${screen.attempt}`}
          level={level}
          ledger={emptyLedger()}
          completedBefore={saved.completed[level.id] !== undefined}
          free={{ label: 'Práctica gratis', sub: 'no gana ni pierde DINO' }}
          dev={prefs.dev}
          reducedMotion={reduce}
          hasNext={level.id < LEVELS.length}
          onComplete={onComplete}
          onExit={() => go({ name: 'levels' })}
          onNext={() => go({ name: 'game', levelId: level.id + 1, attempt: 0 })}
          onRetry={() => go({ name: 'game', levelId: level.id, attempt: screen.attempt + 1 })}
          onHelp={openHelp}
        />
      )}

      {screen.name === 'duel' && <DuelScreen initialCode={screen.code} dev={prefs.dev} reducedMotion={reduce} onHelp={openHelp} onBack={() => go({ name: 'start' })} />}
      {screen.name === 'shelter' && <ShelterScreen dev={prefs.dev} onBack={() => go({ name: 'start' })} onEvent={() => go({ name: 'event' })} />}
      {screen.name === 'event' && <EventScreen dev={prefs.dev} reducedMotion={reduce} onHelp={openHelp} onBack={() => go({ name: 'start' })} />}
      {screen.name === 'wallet' && <WalletScreen dev={prefs.dev} onBack={() => go({ name: 'start' })} />}

      {helpOpen && <HelpModal onClose={() => { setHelpOpen(false); setPrefs({ seenHelp: true }); }} />}
      {settingsOpen && (
        <SettingsModal
          saved={saved}
          osReduce={osReduce}
          onChange={setPrefs}
          onReset={() => {
            if (window.confirm('¿Borrar el progreso de práctica? (Los saldos viven en el servidor.)')) {
              clearSaved();
              setSaved(loadSaved());
              setScreen({ name: 'start' });
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function StartScreen({ onPlay, onDuel, onShelter, onEvent, onWallet, onHelp }: { onPlay: () => void; onDuel: () => void; onShelter: () => void; onEvent: () => void; onWallet: () => void; onHelp: () => void }) {
  return (
    <main className="start">
      <div className="start-sky" aria-hidden="true" />
      <Volcano style={{ position: 'absolute', right: '4%', top: 40, width: 260 }} />
      <Palm style={{ position: 'absolute', left: '2%', bottom: 0, width: 150 }} />
      <Palm flip style={{ position: 'absolute', right: '3%', bottom: 0, width: 130 }} />
      <Fern style={{ position: 'absolute', left: '16%', bottom: 0, width: 120 }} />
      <div className="start-card">
        <h1>Dino <span>Escape</span></h1>
        <p className="tagline">Construye el camino, gira las piezas y lleva a los dinos a su refugio antes de que se acabe el tiempo. Cada duelo ayuda a reconstruir el refugio comunitario.</p>
        <div className="hero" aria-hidden="true">
          <svg viewBox="-60 -60 120 120" width="190" height="190" className="hero-dino"><DinoArt dino="green" mood="happy" /></svg>
          <svg viewBox="-60 -60 120 120" width="150" height="150" className="hero-dino small"><DinoArt dino="orange" facing={-1} /></svg>
        </div>
        <div className="row center">
          <button className="btn primary big" onClick={onPlay} autoFocus>Practicar gratis</button>
          <button className="btn big" onClick={onDuel}>Duelos</button>
          <button className="btn big" onClick={onShelter}>Refugio</button>
          <button className="btn big" onClick={onEvent}>Evento comunitario</button>
        </div>
        <div className="row center">
          <button className="btn" onClick={onWallet}>Mi saldo</button>
          <button className="btn" onClick={onHelp}>Cómo jugar</button>
        </div>
        <p className="proto">Prototipo — DINO de prueba · sin billeteras, contratos ni dinero real</p>
      </div>
    </main>
  );
}

function LevelSelect({ saved, unlocked, dev, onPick, onBack }: { saved: Saved; unlocked: (id: number) => boolean; dev: boolean; onPick: (id: number) => void; onBack: () => void }) {
  const cards = useMemo(() => LEVELS, []);
  return (
    <main className="levels">
      <div className="levels-head">
        <button className="btn ghost" onClick={onBack}>← Inicio</button>
        <h2>Practicar gratis{dev && <span className="dev-tag">DEV: todos abiertos</span>}</h2>
      </div>
      <p className="muted">Aquí aprendes sin arriesgar nada: la práctica no gana ni pierde DINO y no hace avanzar el refugio. Reintentos ilimitados.</p>
      <div className="levels-grid">
        {cards.map((lv) => {
          const done = saved.completed[lv.id];
          const open = unlocked(lv.id);
          const status = done ? 'Completado' : open ? 'Disponible' : 'Bloqueado';
          return (
            <button key={lv.id} className={`level-card ${done ? 'done' : open ? 'open' : 'locked'}`} disabled={!open} onClick={() => onPick(lv.id)} aria-label={`Nivel ${lv.id}: ${lv.name}. ${status}`}>
              <span className="level-num">{lv.id}</span>
              <strong>{lv.name}</strong>
              <span className="level-meta">{lv.size} × {lv.size} · {fmtTime(lv.timeSec)} · {lv.dinos.length === 2 ? '2 dinos' : '1 dino'}</span>
              <span className="level-diff">{lv.difficulty}</span>
              <span className={`chip ${done ? 'ok' : open ? '' : 'lock'}`}>
                {done ? `✔ Completado · mejor ${fmtTime(done.bestUsedSec)}` : open ? 'Disponible' : '🔒 Bloqueado'}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="overlay modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost round" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cómo jugar" onClose={onClose}>
      <ol className="help">
        <li>Pulsa <strong>Comenzar nivel</strong>: el cronómetro arranca y puedes construir.</li>
        <li>Elige una pieza de la bandeja, <strong>gírala</strong> (↺ ↻ o teclas Q / R) y pulsa una casilla libre. En escritorio también puedes arrastrarla.</li>
        <li>Une la <strong>salida</strong> con el <strong>refugio</strong>. Dos piezas vecinas se conectan solo si las dos tienen abertura en el borde compartido.</li>
        <li>Pulsa <strong>¡Corre, Dino!</strong>. Si el camino falla verás dónde y puedes corregir mientras quede tiempo: el error gasta tiempo, no DINO.</li>
        <li>Si el tiempo llega a cero, el tablero se oscurece y puedes reintentar.</li>
      </ol>
      <div className="help-pieces">
        {(
          [
            ['straight', 'Recta: dos lados opuestos.'],
            ['curve', 'Curva: dos lados contiguos.'],
            ['tee', 'Cruce en T: entra por cualquier lado menos el de la flecha y sale siempre por la flecha.'],
            ['bridge', 'Puente: cruza dos caminos a distinta altura; no cambia de eje.'],
          ] as const
        ).map(([t, d]) => (
          <div key={t} className="help-piece">
            <PieceIcon type={t} arrow="left" size={52} />
            <span>{d}</span>
          </div>
        ))}
      </div>
      <h3>Elementos del nivel</h3>
      <ul className="help">
        <li><strong>Piedras</strong> y <strong>caminos de piedra con candado</strong> no se pueden tocar. Las casillas con borde punteado son las libres.</li>
        <li><strong>Portales</strong>: entra por su conexión y sales por la de su pareja (mismo color y símbolo):{' '}
          {Object.entries(PORTAL_STYLES).slice(0, 2).map(([k, s]) => (
            <span key={k} className="inline-sym"><SymbolBadge kind={s.symbol} color={s.color} /></span>
          ))}
        </li>
        <li>Dos dinos ({DINO_COLORS.green.name} y {DINO_COLORS.orange.name}): cada uno a su refugio. Si coinciden en una casilla o se cruzan de frente, chocan. En un puente, por ejes distintos, no. Elige quién sale primero y con qué retraso (1–10 s).</li>
      </ul>
      <h3>Reglas económicas (DINO de prueba)</h3>
      <ul className="help">
        <li><strong>Practicar</strong> es gratis: no gana ni pierde DINO.</li>
        <li><strong>Duelo</strong>: cada jugador aporta 10 DINO, que quedan bloqueados. Gana el primer recorrido correcto (reloj del servidor) y recibe 19; 0,5 va a la operación del proyecto y 0,5 al refugio. El perdedor pierde solo sus 10.</li>
        <li><strong>Devoluciones sin comisión</strong>: empate (menos de 500 ms), nadie completa, sala sin llenar en 5 min, cancelación antes de empezar o falla del sistema.</li>
        <li><strong>Refugio</strong>: cada duelo válido suma un rescate y 0,5 DINO. Con 100 rescates y 50 DINO se abre un evento gratuito con premios de 25, 15 y 10.</li>
      </ul>
      <p className="tiny">Todo es DINO de prueba en un servidor de demostración: sin billeteras, contratos, compras ni valor real. No hay promesas de rentabilidad.</p>
      <div className="row center"><button className="btn primary big" onClick={onClose}>¡Entendido!</button></div>
    </Modal>
  );
}

function SettingsModal({ saved, osReduce, onChange, onReset, onClose }: { saved: Saved; osReduce: boolean; onChange: (p: Partial<Saved['prefs']>) => void; onReset: () => void; onClose: () => void }) {
  const p = saved.prefs;
  return (
    <Modal title="Ajustes" onClose={onClose}>
      <div className="settings">
        <label className="field inline">
          <input type="checkbox" checked={p.sound} onChange={(e) => onChange({ sound: e.target.checked })} /> Sonido
        </label>
        <label className="field">
          <span>Volumen</span>
          <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        </label>
        <label className="field inline">
          <input type="checkbox" checked={p.reduceMotion || osReduce} disabled={osReduce} onChange={(e) => onChange({ reduceMotion: e.target.checked })} />
          Reducir movimiento {osReduce && '(activado por tu sistema)'}
        </label>
        <label className="field inline">
          <input type="checkbox" checked={p.dev} onChange={(e) => onChange({ dev: e.target.checked })} />
          Modo desarrollo (abrir cualquier nivel, ver soluciones, saldo de prueba, precargar el refugio, acelerar el evento). Recarga la página para aplicarlo al servidor.
        </label>
        <button className="btn" onClick={onReset}>Borrar progreso de práctica</button>
      </div>
    </Modal>
  );
}
