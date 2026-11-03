import { useRef, useState } from 'react';
import { net } from '../net/client';
import type { RoomView } from '../net/client';
import { emptyLedger } from '../rewards/rewardRules';
import { play } from '../platform/sound';
import { DinoArt } from './art';
import { Game, fmtTime } from './Game';
import { FeeTable, Offline, Rules, fmtCountdown, fmtD, useNet, useServerNow } from './common';

interface Props {
  initialCode?: string;
  dev: boolean;
  reducedMotion: boolean;
  onHelp: () => void;
  onBack: () => void;
}

const STATE_LABEL: Record<string, string> = {
  conectado: 'Conectado',
  building: 'Construyendo',
  running: 'Probando recorrido',
  finished: 'Finalizó',
  desconectado: 'Desconectado',
};

const act = (op: string, args: Record<string, unknown> = {}, setErr?: (e: string) => void) =>
  net.call(op, args).then(
    (r) => {
      setErr?.('');
      return r;
    },
    (e: Error) => {
      setErr?.(e.message);
      return undefined;
    },
  );

export function DuelScreen({ initialCode, dev, reducedMotion, onHelp, onBack }: Props) {
  const n = useNet();
  const room = n.view?.room ?? null;
  if (n.status !== 'online' || !n.view) {
    return (
      <main className="room">
        <div className="levels-head"><button className="btn ghost" onClick={onBack}>← Inicio</button><h2>Duelos</h2></div>
        <Offline status={n.status} />
      </main>
    );
  }
  if (!room) return <Browse initialCode={initialCode} onBack={onBack} />;
  if (room.status === 'waiting') return <Waiting room={room} />;
  if (room.status === 'racing') return <Match room={room} dev={dev} reducedMotion={reducedMotion} onHelp={onHelp} />;
  return <Result room={room} onBack={onBack} />;
}

function Browse({ initialCode, onBack }: { initialCode?: string; onBack: () => void }) {
  const n = useNet();
  const cfg = n.config!;
  const v = n.view!;
  const [levelId, setLevelId] = useState(3);
  const [entry, setEntry] = useState(cfg.entry[0]);
  const [code, setCode] = useState(initialCode ?? '');
  const [err, setErr] = useState('');
  const poor = v.wallet.available < entry;
  return (
    <main className="room">
      <div className="levels-head"><button className="btn ghost" onClick={onBack}>← Inicio</button><h2>Duelos con DINO de prueba</h2></div>
      <p className="muted">Dos jugadores resuelven el mismo tablero inédito. Antes de entrar verás todo lo que se reserva y cómo se reparte.</p>
      {err && <p className="tiny err" role="alert">{err}</p>}
      <div className="room-grid">
        <section className="card-plain">
          <h3>Crear sala</h3>
          <label className="field"><span>Dificultad</span>
            <select value={levelId} onChange={(e) => setLevelId(Number(e.target.value))}>
              {cfg.levels.map((l) => <option key={l.id} value={l.id}>{l.id}. {l.name} · {l.size}×{l.size} · {fmtTime(l.timeSec)}{l.dinos === 2 ? ' · 2 dinos' : ''}</option>)}
            </select>
          </label>
          <label className="field"><span>Entrada por jugador (DINO de prueba)</span>
            <select value={entry} onChange={(e) => setEntry(Number(e.target.value))}>
              {cfg.entry.map((x) => <option key={x} value={x}>{fmtD(x)}</option>)}
            </select>
          </label>
          <FeeTable entry={entry} cfg={cfg} />
          <button className="btn primary big" disabled={poor} onClick={() => { play('click'); act('room.create', { levelId, entry }, setErr); }}>
            Reservar {fmtD(entry)} y crear sala
          </button>
          {poor && <p className="tiny err">Saldo disponible insuficiente. En modo desarrollo puedes pedir saldo de prueba desde «Mi saldo».</p>}
        </section>

        <section className="card-plain">
          <h3>Unirme con código</h3>
          <input className="text-in code" value={code} maxLength={5} placeholder="ABCDE" onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Código de sala" />
          <button className="btn big" disabled={code.length < 5 || poor} onClick={() => { play('click'); act('room.join', { code }, setErr); }}>Reservar y unirme</button>
          <h3>Salas abiertas</h3>
          {v.rooms.length === 0 && <p className="tiny">No hay salas abiertas. Crea una y comparte el código.</p>}
          <ul className="seats">
            {v.rooms.map((r) => (
              <li key={r.code}>
                <span><strong>{r.code}</strong> · {r.levelName} · {fmtTime(r.timeSec)} · {fmtD(r.entry)} DINO · {r.host}</span>
                <button className="btn small" disabled={v.wallet.available < r.entry} onClick={() => act('room.join', { code: r.code }, setErr)}>Unirme</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-plain wide">
          <h3>Reglas</h3>
          <Rules cfg={cfg} />
        </section>
      </div>
    </main>
  );
}

function Waiting({ room }: { room: RoomView }) {
  const n = useNet();
  const now = useServerNow();
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const me = room.players.find((p) => p.me)!;
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const copy = async (t: string, k: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(k);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      window.prompt('Copia esto:', t);
    }
  };
  return (
    <main className="room">
      <div className="levels-head">
        <button className="btn ghost" onClick={() => act('room.leave', {}, setErr)}>← Cancelar y recuperar aporte</button>
        <h2>Sala <span className="code-big">{room.code}</span></h2>
      </div>
      {err && <p className="tiny err" role="alert">{err}</p>}
      <div className="room-grid">
        <section className="card-plain">
          <h3>Participantes ({room.players.length}/2)</h3>
          <ul className="seats">
            {[0, 1].map((i) => {
              const p = room.players[i];
              return p ? (
                <li key={p.id} className={p.me ? 'me' : ''}>
                  <svg viewBox="-50 -50 100 100" width="34" height="34" aria-hidden="true"><DinoArt dino={i ? 'orange' : 'green'} /></svg>
                  <span>{p.name}{p.me ? ' (tú)' : ''} · {STATE_LABEL[p.state] ?? p.state}</span>
                  <span className={`chip ${p.ready ? 'ok' : ''}`}>{p.ready ? '✔ Listo' : 'Sin confirmar'}</span>
                </li>
              ) : <li key={i} className="empty">Esperando al segundo jugador…</li>;
            })}
          </ul>
          <p className="tiny">Aporte reservado: <strong>{fmtD(room.entry)}</strong> cada uno. Saldo disponible: {fmtD(n.view!.wallet.available)} · bloqueado: {fmtD(n.view!.wallet.locked)}.</p>
          <p className="tiny">La sala se cancela en <strong>{fmtCountdown(room.expiresAt - now)}</strong> si no se completa; se devuelven los aportes.</p>
          <button className="btn primary big" disabled={room.players.length < 2} onClick={() => { play('click'); act('room.ready', { ready: !me.ready }, setErr); }}>
            {me.ready ? 'Quitar confirmación' : '¡Estoy listo!'}
          </button>
          <div className="row">
            <button className="btn" onClick={() => copy(room.code, 'c')}>{copied === 'c' ? '¡Copiado!' : 'Copiar código'}</button>
            <button className="btn" onClick={() => copy(link, 'l')}>{copied === 'l' ? '¡Copiado!' : 'Copiar enlace'}</button>
          </div>
        </section>
        <section className="card-plain">
          <h3>{room.levelName} · {room.difficulty}</h3>
          <p className="tiny">Tiempo límite {fmtTime(room.timeSec)}. Tablero inédito, igual para ambos; el servidor fija el inicio común.</p>
          <FeeTable entry={room.entry} cfg={n.config} />
        </section>
        <section className="card-plain wide"><h3>Reglas</h3><Rules cfg={n.config} /></section>
      </div>
    </main>
  );
}

function Match({ room, dev, reducedMotion, onHelp }: { room: RoomView; dev: boolean; reducedMotion: boolean; onHelp: () => void }) {
  const now = useServerNow(200);
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const elapsed0 = useRef(Math.max(0, net.serverNow() - room.startAt));
  const rival = room.players.find((p) => !p.me);
  if (now < room.startAt) {
    return (
      <main className="room countdown">
        <h2>¡Prepárate!</h2>
        <div className="count-num" aria-live="assertive">{Math.ceil((room.startAt - now) / 1000)}</div>
        <p className="muted">{room.levelName} · mismo tablero para los dos · {fmtTime(room.timeSec)}</p>
      </main>
    );
  }
  const level = room.level!;
  return (
    <div className="race-wrap">
      <div className="race-bar">
        <aside className="standings" aria-label="Estado del rival">
          <h3>Sala {room.code} · {fmtD(room.entry * 2)} DINO en juego</h3>
          <div className="lane"><span className="lane-name">{rival?.name ?? 'Rival'}</span><span className={`chip ${rival?.state === 'finished' ? 'ok' : ''}`}>{STATE_LABEL[rival?.state ?? ''] ?? rival?.state}</span></div>
          {sent && <p className="banner small-banner">Resultado enviado: el servidor lo está verificando…</p>}
          {msg && <p className="banner error small-banner" role="alert">{msg}</p>}
        </aside>
      </div>
      <Game
        key={room.code}
        level={level}
        ledger={emptyLedger()}
        completedBefore
        dev={dev}
        reducedMotion={reducedMotion}
        hasNext={false}
        online={{
          elapsedMs: elapsed0.current,
          label: 'Duelo',
          sub: 'el servidor decide',
          onPhase: (p) => void act('match.phase', { phase: p }),
          onFinish: (sub) => {
            setSent(true);
            net.call<{ ok: boolean; reason?: string }>('match.submit', { sub }).then(
              (r) => {
                if (!r.ok) {
                  setSent(false);
                  setMsg(r.reason ?? 'El servidor rechazó el resultado.');
                }
              },
              (e: Error) => setMsg(e.message),
            );
          },
        }}
        onComplete={() => undefined}
        onExit={() => setMsg('No puedes abandonar una partida en curso: el cronómetro sigue.')}
        onNext={() => undefined}
        onRetry={() => undefined}
        onHelp={onHelp}
      />
    </div>
  );
}

function Result({ room, onBack }: { room: RoomView; onBack: () => void }) {
  const n = useNet();
  const o = room.outcome;
  const me = room.players.find((p) => p.me)!;
  const won = o?.kind === 'win' && o.winnerId === me.id;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  return (
    <main className="room">
      <div className="levels-head"><h2>Resultado · sala {room.code}</h2></div>
      <div className="room-grid">
        <section className="card-plain wide">
          {o?.kind === 'win' ? (
            <>
              <h3>{won ? '¡Ganaste!' : `Ganó ${byId.get(o.winnerId!)?.name}`}</h3>
              <dl className="split">
                <div><dt>Ganador recibe</dt><dd>{fmtD(o.winnerGets)}</dd></div>
                <div><dt>Operación del proyecto</dt><dd>{fmtD(o.operation)}</dd></div>
                <div><dt>Refugio comunitario</dt><dd>{fmtD(o.shelter)}</dd></div>
                <div className="total"><dt>Total aportado</dt><dd>{fmtD(o.pot)}</dd></div>
              </dl>
              <p className="tiny">{won ? `Tu neto: +${fmtD(o.winnerGets - room.entry)} DINO de prueba.` : `Perdiste tu aporte: −${fmtD(room.entry)}. No se tocó el resto de tu saldo.`}</p>
              <p className="tiny shelter-note">🦕 El refugio sumó 1 rescate y {fmtD(o.shelter)} DINO. Liquidación única: {o.settlementId}.</p>
            </>
          ) : (
            <>
              <h3>Aportes devueltos</h3>
              <p>Motivo: {o?.reason ?? room.status}. No se cobró comisión y no suma al refugio.</p>
            </>
          )}
          {o && Object.keys(o.times).length > 0 && (
            <ul className="seats">
              {Object.entries(o.times).map(([id, t]) => <li key={id}>{byId.get(id)?.name}: {(t / 1000).toFixed(2)} s (tiempo medido por el servidor)</li>)}
            </ul>
          )}
          <p className="tiny">Saldo disponible: <strong>{fmtD(n.view!.wallet.available)}</strong> · bloqueado: {fmtD(n.view!.wallet.locked)}</p>
          <div className="row"><button className="btn primary big" onClick={() => act('room.leave').then(onBack)}>Volver</button></div>
        </section>
      </div>
    </main>
  );
}
