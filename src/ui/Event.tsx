import { useRef, useState } from 'react';
import { net } from '../net/client';
import type { Level } from '../game/types';
import { emptyLedger } from '../rewards/rewardRules';
import { Game, fmtTime } from './Game';
import { Offline, fmtCountdown, fmtD, useNet, useServerNow } from './common';

export function EventScreen({ dev, reducedMotion, onHelp, onBack }: { dev: boolean; reducedMotion: boolean; onHelp: () => void; onBack: () => void }) {
  const n = useNet();
  const now = useServerNow();
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState<{ level: Level; elapsed: number } | null>(null);
  const [sent, setSent] = useState('');
  const elapsedRef = useRef(0);
  const head = <div className="levels-head"><button className="btn ghost" onClick={onBack}>← Inicio</button><h2>Evento comunitario</h2></div>;
  if (n.status !== 'online' || !n.view) return <main className="room">{head}<Offline status={n.status} /></main>;
  const ev = n.view.event.active;
  const last = n.view.event.last;
  const call = (op: string, args: Record<string, unknown> = {}) => net.call(op, args).then((r) => { setErr(''); return r; }, (e: Error) => { setErr(e.message); return undefined; });

  // Intento en curso (el servidor mide el tiempo desde que lo inicias)
  const level = playing?.level ?? (ev?.me?.started && ev.me.ms === null ? ev.level : null);
  if (ev && level && ev.me?.started && ev.me.ms === null) {
    if (!playing) elapsedRef.current = Math.max(0, now - (ev.me.deadline! - level.timeSec * 1000));
    return (
      <div className="race-wrap">
        <div className="race-bar"><aside className="standings"><h3>Evento comunitario · ciclo {ev.cycle}</h3>{sent && <p className="banner small-banner">{sent}</p>}{err && <p className="banner error small-banner">{err}</p>}</aside></div>
        <Game
          key={`ev${ev.cycle}`}
          level={level}
          ledger={emptyLedger()}
          completedBefore
          dev={dev}
          reducedMotion={reducedMotion}
          hasNext={false}
          online={{
            elapsedMs: elapsedRef.current,
            label: 'Evento gratis',
            sub: 'un intento por cuenta',
            onFinish: (sub) => {
              setSent('Enviado: el servidor lo está verificando…');
              net.call<{ ok: boolean; reason?: string }>('event.submit', { sub }).then(
                (r) => { setSent(r.ok ? 'Resultado registrado. La clasificación se verá al cierre.' : ''); if (!r.ok) setErr(r.reason ?? 'Rechazado.'); setPlaying(null); },
                (e: Error) => setErr(e.message),
              );
            },
          }}
          onComplete={() => undefined}
          onExit={() => setErr('No puedes abandonar el intento: el cronómetro sigue.')}
          onNext={() => undefined}
          onRetry={() => undefined}
          onHelp={onHelp}
        />
      </div>
    );
  }

  return (
    <main className="room">
      {head}
      {err && <p className="tiny err" role="alert">{err}</p>}
      <div className="room-grid">
        {ev ? (
          <section className="card-plain wide">
            <h3>Ciclo {ev.cycle} · {ev.levelName} ({fmtTime(ev.timeSec)})</h3>
            <p>Presupuesto reservado: <strong>{fmtD(ev.budget)}</strong> DINO de prueba · participar es <strong>gratis</strong>, sin aportar DINO.</p>
            <table className="fee-table"><caption>Reparto publicado</caption><tbody>
              {ev.prizes.map((p, i) => <tr key={i}><th>{i + 1}.º puesto</th><td>{fmtD(p)}</td></tr>)}
            </tbody></table>
            <p className="tiny">Empate exacto: se divide entre los empatados la suma de los premios de los puestos que ocupan. Los premios de puestos sin ocupar regresan al refugio; si nadie termina, regresan los 50 DINO.</p>
            <p className="tiny">Mismo desafío para todos. Cada cuenta tiene <strong>un intento</strong> cronometrado, con correcciones mientras quede tiempo. Se comparan los tiempos validados por el servidor; soluciones y clasificación quedan ocultas hasta el cierre. (El límite por cuenta es solo del prototipo: no protege contra múltiples cuentas.)</p>
            {ev.phase === 'registration' && (
              <>
                <p>Inscripciones abiertas: cierran en <strong>{fmtCountdown(ev.registrationEndsAt - now)}</strong>. Inscritos: {ev.registered}. Después habrá 24 h para jugar.</p>
                <button className="btn primary big" disabled={!!ev.me?.registered} onClick={() => call('event.register')}>{ev.me?.registered ? '✔ Inscrito' : 'Inscribirme gratis'}</button>
              </>
            )}
            {ev.phase === 'attempts' && (
              <>
                <p>Intentos abiertos hasta dentro de <strong>{fmtCountdown(ev.attemptsEndsAt - now)}</strong>. Inscritos: {ev.registered} · terminaron: {ev.finished}.</p>
                {ev.me?.ms != null ? <p className="shelter-note">Tu resultado está registrado ({(ev.me.ms / 1000).toFixed(2)} s). Verás la clasificación al cierre.</p> : ev.me?.registered ? (
                  <button className="btn primary big" onClick={async () => { const r = (await call('event.start')) as { level: Level } | undefined; if (r) { elapsedRef.current = 0; setPlaying({ level: r.level, elapsed: 0 }); } }}>Empezar mi intento (único)</button>
                ) : <p className="tiny">No te inscribiste a tiempo en este ciclo.</p>}
              </>
            )}
            {dev && n.serverDev && <div className="devbox"><strong>DEV</strong><button className="btn small" onClick={() => call('dev', { action: 'advance' })}>Acelerar al siguiente plazo</button></div>}
          </section>
        ) : (
          <section className="card-plain wide">
            <h3>No hay evento activo</h3>
            <p className="tiny">Se abre cuando el refugio reúne {n.config?.goalRescues} duelos válidos y 50 DINO. Mientras tanto, las comisiones se acumulan.</p>
            {dev && n.serverDev && <div className="devbox"><strong>DEV</strong><span className="tiny">Precarga el refugio desde su pantalla y juega un duelo para abrirlo.</span></div>}
          </section>
        )}
        {last && (
          <section className="card-plain wide">
            <h3>Resultados del ciclo {last.cycle}</h3>
            {last.results && last.results.length > 0 ? (
              <table className="ledger"><thead><tr><th>Puesto</th><th>Jugador</th><th className="num">Tiempo</th><th className="num">Premio</th></tr></thead><tbody>
                {last.results.map((r) => <tr key={r.id}><td>{r.place}.º</td><td>{r.name}</td><td className="num">{(r.ms / 1000).toFixed(2)} s</td><td className="num">{fmtD(r.prize)}</td></tr>)}
              </tbody></table>
            ) : <p>Nadie completó el desafío: los {fmtD(last.budget)} DINO regresaron al refugio.</p>}
            {last.returned > 0 && <p className="tiny">Volvieron al refugio {fmtD(last.returned)} DINO no repartidos.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
