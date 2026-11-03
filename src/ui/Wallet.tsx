import { useState } from 'react';
import { net } from '../net/client';
import { KIND_LABEL, Offline, fmtD, signD, useNet } from './common';

export function WalletScreen({ dev, onBack }: { dev: boolean; onBack: () => void }) {
  const n = useNet();
  const [err, setErr] = useState('');
  if (n.status !== 'online' || !n.view) {
    return <main className="room"><div className="levels-head"><button className="btn ghost" onClick={onBack}>← Inicio</button><h2>Mi saldo</h2></div><Offline status={n.status} /></main>;
  }
  const w = n.view.wallet;
  return (
    <main className="room">
      <div className="levels-head"><button className="btn ghost" onClick={onBack}>← Inicio</button><h2>Mi saldo · {n.me?.name}</h2></div>
      <div className="room-grid">
        <section className="card-plain">
          <h3>DINO de prueba</h3>
          <dl className="split">
            <div><dt>Disponible</dt><dd>{fmtD(w.available)}</dd></div>
            <div><dt>Bloqueado en partidas</dt><dd>{fmtD(w.locked)}</dd></div>
            <div className="total"><dt>Total</dt><dd>{fmtD(w.available + w.locked)}</dd></div>
          </dl>
          <p className="tiny">Saldo simulado en un servidor de prueba: sin billeteras, contratos ni valor real. Lo bloqueado no se puede gastar hasta que la partida se liquide o se devuelva.</p>
          {dev && n.serverDev && (
            <div className="devbox">
              <strong>DEV</strong>
              <button className="btn small" onClick={() => net.call('dev', { action: 'grant', arg: 10_000 }).then(() => setErr(''), (e: Error) => setErr(e.message))}>+100 DINO de prueba</button>
              {err && <span className="tiny err">{err}</span>}
            </div>
          )}
        </section>
        <section className="card-plain wide">
          <h3>Historial</h3>
          {w.entries.length === 0 ? <p className="tiny">Sin movimientos.</p> : (
            <table className="ledger">
              <thead><tr><th>Fecha</th><th>Movimiento</th><th className="num">Cambio</th><th>Detalle</th></tr></thead>
              <tbody>
                {w.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.ts).toLocaleString('es')}</td>
                    <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td className={`num ${e.amount > 0 ? 'up' : e.amount < 0 ? 'down' : ''}`}>{e.amount === 0 ? `↔ ${fmtD(e.raw ?? 0)}` : signD(e.amount)}</td>
                    <td className="tiny">{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
