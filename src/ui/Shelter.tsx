import { useState } from 'react';
import { net } from '../net/client';
import { DinoArt } from './art';
import { KIND_LABEL, Offline, fmtD, signD, useNet } from './common';

type Kind = 'tuft' | 'rock' | 'palm' | 'fern' | 'fence' | 'nest' | 'dome' | 'den' | 'dino' | 'flag';
interface Item {
  at: number;
  kind: Kind;
  x: number;
  y: number;
  i: number;
}

/** Cada elemento aparece cuando los rescates reales alcanzan su umbral (etapas 0–24, 25–49, 50–74, 75–99, 100). */
const ITEMS: Item[] = [
  ...Array.from({ length: 8 }, (_, i): Item => ({ kind: i % 2 ? 'rock' : 'tuft', at: 3 * (i + 1), x: 50 + i * 78, y: 238 + (i % 3) * 8, i })),
  ...Array.from({ length: 6 }, (_, i): Item => ({ kind: i % 2 ? 'fern' : 'palm', at: 25 + 4 * (i + 1), x: 40 + i * 112, y: 226, i })),
  ...Array.from({ length: 4 }, (_, i): Item => ({ kind: 'fence', at: 25 + 24 - 6 + i * 2, x: 150 + i * 90, y: 252, i })),
  ...Array.from({ length: 4 }, (_, i): Item => ({ kind: 'nest', at: 50 + 6 * (i + 1), x: 110 + i * 130, y: 262, i })),
  { kind: 'dome', at: 72, x: 320, y: 255, i: 0 },
  { kind: 'den', at: 78, x: 320, y: 222, i: 0 },
  ...Array.from({ length: 4 }, (_, i): Item => ({ kind: 'dino', at: 80 + 5 * i, x: 130 + i * 125, y: 232, i })),
  { kind: 'flag', at: 100, x: 400, y: 168, i: 0 },
];

function Piece({ it }: { it: Item }) {
  switch (it.kind) {
    case 'tuft':
      return <g><path d="M-10 0 L-6 -14 L-2 0 M-3 0 L1 -18 L5 0 M3 0 L9 -12 L12 0" fill="#58a83b" stroke="#2f7a2a" strokeWidth="1.5" strokeLinejoin="round" /></g>;
    case 'rock':
      return <g><path d="M-16 0 Q-14 -16 0 -16 Q14 -15 16 0 Z" fill="#a9a496" stroke="#6f6a5c" strokeWidth="2" /><path d="M-6 -10 Q0 -14 6 -10" fill="none" stroke="#d1ccbd" strokeWidth="2" strokeLinecap="round" /></g>;
    case 'palm':
      return (
        <g>
          <path d="M-3 0 Q-6 -30 0 -62 L5 -62 Q2 -30 4 0 Z" fill="#9a6a38" stroke="#6b4423" strokeWidth="2" />
          {[-60, -30, 0, 30, 60].map((a) => <ellipse key={a} cx="2" cy="-68" rx="24" ry="7" fill={a % 60 ? '#3da24c' : '#2f8a3c'} stroke="#226b2c" strokeWidth="1.5" transform={`rotate(${a - 90} 2 -64) translate(18 0)`} />)}
        </g>
      );
    case 'fern':
      return <g>{[-40, -15, 10, 35].map((a) => <path key={a} d="M0 0 Q-6 -22 0 -40 Q8 -22 0 0Z" fill="#4cb35a" stroke="#2c7a38" strokeWidth="1.5" transform={`rotate(${a})`} />)}</g>;
    case 'fence':
      return <g><rect x="-26" y="-22" width="6" height="26" rx="2" fill="#b17a43" stroke="#6b4423" strokeWidth="1.5" /><rect x="20" y="-22" width="6" height="26" rx="2" fill="#b17a43" stroke="#6b4423" strokeWidth="1.5" /><rect x="-26" y="-16" width="52" height="5" rx="2" fill="#c98f55" stroke="#6b4423" strokeWidth="1.5" /><rect x="-26" y="-6" width="52" height="5" rx="2" fill="#c98f55" stroke="#6b4423" strokeWidth="1.5" /></g>;
    case 'nest':
      return <g><ellipse rx="32" ry="11" fill="#b27a42" stroke="#6b4423" strokeWidth="2" /><path d="M-28 -2 Q0 8 28 -2" fill="none" stroke="#7f5429" strokeWidth="2" /><ellipse cx="-9" cy="-8" rx="7.5" ry="10" fill="#fff6dc" stroke="#b79b62" strokeWidth="1.5" /><ellipse cx="9" cy="-9" rx="7.5" ry="10" fill="#f6ecc8" stroke="#b79b62" strokeWidth="1.5" /></g>;
    case 'dome':
      return <ellipse rx="150" ry="62" fill="url(#domeGlow)" stroke="#7fd4ff" strokeWidth="2" strokeDasharray="6 6" />;
    case 'den':
      return (
        <g>
          <path d="M-70 0 L-70 -30 Q-70 -78 0 -78 Q70 -78 70 -30 L70 0 Z" fill="#c9bfa5" stroke="#7a705a" strokeWidth="3" />
          <path d="M-36 0 L-36 -26 Q-36 -52 0 -52 Q36 -52 36 -26 L36 0 Z" fill="#3b2d1f" />
          <path d="M-78 -34 Q0 -100 78 -34" fill="none" stroke="#8a6a3a" strokeWidth="9" strokeLinecap="round" />
          <circle cx="-52" cy="-20" r="6" fill="#ffd36b" /><circle cx="52" cy="-20" r="6" fill="#ffd36b" />
        </g>
      );
    case 'dino':
      return <g transform={`scale(${it.i % 2 ? -0.5 : 0.5} 0.5)`}><DinoArt dino={it.i % 2 ? 'orange' : 'green'} mood="happy" /></g>;
    case 'flag':
      return <g><rect x="-2" y="-44" width="4" height="64" fill="#6b4423" /><path d="M2 -44 L48 -34 L2 -22 Z" fill="#f7973a" stroke="#b6620f" strokeWidth="2" strokeLinejoin="round" /></g>;
  }
}

export function ShelterScene({ rescues }: { rescues: number }) {
  return (
    <svg viewBox="0 0 640 300" width="100%" role="img" aria-label={`Refugio reconstruido: ${rescues} de 100 rescates`} className="shelter-scene">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7ec8ee" /><stop offset="1" stopColor="#ffe9b8" /></linearGradient>
        <linearGradient id="hillA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8ccf6a" /><stop offset="1" stopColor="#5ea84a" /></linearGradient>
        <linearGradient id="hillB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fbb55" /><stop offset="1" stopColor="#3f8a3a" /></linearGradient>
        <radialGradient id="sun"><stop offset="0" stopColor="#fff6c0" /><stop offset="1" stopColor="#ffd36b" /></radialGradient>
        <radialGradient id="domeGlow"><stop offset="0" stopColor="#bff0ff" stopOpacity="0.05" /><stop offset="1" stopColor="#7fd4ff" stopOpacity="0.35" /></radialGradient>
      </defs>
      <rect width="640" height="300" fill="url(#sky)" rx="14" />
      <circle cx="545" cy="58" r="52" fill="#fff1b0" opacity="0.35" />
      <circle cx="545" cy="58" r="30" fill="url(#sun)" />
      <g fill="#fff" opacity="0.85"><ellipse cx="120" cy="60" rx="46" ry="14" /><ellipse cx="150" cy="50" rx="30" ry="14" /><ellipse cx="380" cy="42" rx="40" ry="11" /></g>
      <path d="M0 175 L70 110 L120 150 L190 90 L270 170 L330 130 L420 180 V230 H0Z" fill="#9a8fb8" opacity="0.55" />
      <path d="M440 190 L505 95 L575 190Z" fill="#8c5a44" opacity="0.7" /><path d="M492 115 L505 95 L518 115 Q505 124 492 115Z" fill="#f08a3c" opacity="0.85" />
      <path d="M0 215 Q120 175 260 205 T640 195 V300 H0Z" fill="url(#hillA)" />
      <path d="M0 250 Q160 222 320 246 T640 240 V300 H0Z" fill="url(#hillB)" />
      {ITEMS.map((it) => {
        const on = rescues >= it.at;
        return (
          <g key={`${it.kind}${it.i}${it.at}`} className={`s-item ${on ? 'on' : 'off'}`} transform={`translate(${it.x} ${it.y})`}>
            <Piece it={it} />
          </g>
        );
      })}
    </svg>
  );
}

const STAGES = ['0–24 · Terreno y primeros materiales', '25–49 · Vegetación y estructura', '50–74 · Nidos y zonas protegidas', '75–99 · Refugio casi terminado', '100 · Refugio completo'];

export function ShelterScreen({ dev, onBack, onEvent }: { dev: boolean; onBack: () => void; onEvent: () => void }) {
  const n = useNet();
  const [err, setErr] = useState('');
  if (n.status !== 'online' || !n.view) {
    return <main className="shelter"><div className="levels-head"><button className="btn ghost" onClick={onBack}>← Inicio</button><h2>Refugio comunitario</h2></div><Offline status={n.status} /></main>;
  }
  const s = n.view.shelter;
  const ev = n.view.event.active;
  const devCall = (action: string, arg = 0) => net.call('dev', { action, arg }).then(() => setErr(''), (e: Error) => setErr(e.message));
  return (
    <main className="shelter">
      <div className="levels-head">
        <button className="btn ghost" onClick={onBack}>← Inicio</button>
        <h2>Refugio comunitario</h2>
      </div>
      <p className="muted">Fondo separado del dinero bloqueado en partidas. Solo avanza con duelos completados, validados y liquidados con ganador. Los duelos de práctica, los empates y las partidas devueltas no cuentan.</p>
      {s.preloaded && <p className="banner small-banner" role="note">Datos precargados de demostración: {s.goalRescues - 1} rescates y 49,5 DINO añadidos por el modo desarrollo. No son jugadores reales.</p>}
      <div className="shelter-grid">
        <section className="card-plain wide">
          <ShelterScene rescues={s.shownRescues} />
          <ol className="stages" aria-label="Etapas">
            {STAGES.map((t, i) => <li key={t} className={i + 1 < s.stage || s.stage === 5 ? 'ok' : i + 1 === s.stage ? 'now' : ''}>{i + 1 < s.stage || s.stage === 5 ? '✔ ' : ''}{t}</li>)}
          </ol>
          <div className="meter big" role="progressbar" aria-valuemin={0} aria-valuemax={s.goalRescues} aria-valuenow={s.shownRescues} aria-label="Rescates"><i style={{ width: `${(s.shownRescues / s.goalRescues) * 100}%` }} /></div>
          <p><strong>{s.shownRescues}</strong> / {s.goalRescues} rescates{ev && ev.phase !== 'closed' ? ` · siguiente ciclo: ${s.rescues}` : ''} · meta de fondo {fmtD(s.goalFund)} DINO</p>
        </section>

        <section className="card-plain">
          <h3>Fondos (DINO de prueba)</h3>
          <dl className="split">
            <div><dt>Refugio disponible</dt><dd>{fmtD(s.funds.shelter)}</dd></div>
            <div><dt>Reservado para el evento</dt><dd>{fmtD(s.funds.event)}</dd></div>
            <div><dt>Operación del proyecto</dt><dd>{fmtD(s.funds.operation)}</dd></div>
            <div><dt>Bloqueado en tus partidas</dt><dd>{fmtD(n.view.wallet.locked)}</dd></div>
          </dl>
          <p className="tiny">{s.conservation ? '✔ Conservación: todo lo repartido proviene de aportes o saldos de prueba registrados.' : '⚠ El libro no cuadra.'}</p>
        </section>

        <section className="card-plain">
          <h3>Evento comunitario</h3>
          {ev ? <p>Ciclo {ev.cycle} en curso: {ev.phase === 'registration' ? 'inscripciones abiertas' : 'intentos abiertos'}.</p> : <p>Se abre al reunir {s.goalRescues} duelos válidos y {fmtD(s.goalFund)} DINO. Es gratis, sin aportar DINO.</p>}
          <button className="btn primary big" onClick={onEvent}>{ev ? 'Ir al evento' : 'Ver reglas y resultados'}</button>
          {dev && n.serverDev && (
            <div className="devbox">
              <strong>DEV</strong>
              <button className="btn small" disabled={s.preloaded} onClick={() => devCall('preload')}>Precargar 99 rescates y 49,5</button>
              <button className="btn small" disabled={!ev} onClick={() => devCall('advance')}>Acelerar plazo del evento</button>
              {err && <span className="tiny err">{err}</span>}
            </div>
          )}
        </section>

        <section className="card-plain wide">
          <h3>Movimientos del refugio</h3>
          {s.movements.length === 0 ? <p className="tiny">Aún no hay movimientos.</p> : (
            <table className="ledger"><tbody>
              {s.movements.map((m) => <tr key={m.id}><td>{new Date(m.ts).toLocaleString('es')}</td><td>{KIND_LABEL[m.kind] ?? m.kind}</td><td className="num">{fmtD(m.raw ?? 0)}</td><td className="tiny">{m.note}</td></tr>)}
            </tbody></table>
          )}
        </section>
      </div>
    </main>
  );
}

export { signD };
