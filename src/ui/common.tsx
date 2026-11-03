import { useEffect, useState, useSyncExternalStore } from 'react';
import { net } from '../net/client';
import type { NetConfig } from '../net/client';

export const useNet = () => useSyncExternalStore(net.subscribe, net.getState);

/** Unidades mínimas (1 DINO = 100) a texto. */
export const fmtD = (u: number) => (u / 100).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const signD = (u: number) => `${u > 0 ? '+' : ''}${fmtD(u)}`;

export const KIND_LABEL: Record<string, string> = {
  grant: 'Asignación de prueba',
  reserve: 'Reserva de entrada',
  refund: 'Devolución',
  payout: 'Pago al ganador',
  fee_operation: 'Comisión de operación',
  fee_shelter: 'Aporte al refugio',
  event_reserve: 'Reserva del evento',
  event_prize: 'Premio comunitario',
  event_return: 'Fondo vuelve al refugio',
  demo_preload: 'Precarga de demostración',
};

/** Reloj que se actualiza varias veces por segundo (hora estimada del servidor). */
export function useServerNow(ms = 250) {
  const [t, setT] = useState(() => net.serverNow());
  useEffect(() => {
    const i = setInterval(() => setT(net.serverNow()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

export function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(ss).padStart(2, '0')}`;
}

export function Offline({ status }: { status: string }) {
  return (
    <section className="card-plain offline" role="status">
      <h3>{status === 'connecting' ? 'Conectando con el servidor…' : 'Servidor no disponible'}</h3>
      <p className="tiny">
        Los duelos, el refugio, el evento y los saldos los decide un servidor Node.js. Para probarlo en tu equipo ejecuta en la carpeta del proyecto:
      </p>
      <pre className="cmd">npm run server{'\n'}npm run dev</pre>
      <p className="tiny">y abre http://localhost:5173 (o usa <code>npm start</code> para servir todo desde el puerto 8787). El modo práctica funciona sin servidor.</p>
    </section>
  );
}

export function splitFrom(cfg: NetConfig | null, entry: number) {
  const pot = entry * 2;
  const operation = Math.floor((pot * (cfg?.operationBp ?? 250)) / 10_000);
  const shelter = Math.floor((pot * (cfg?.shelterBp ?? 250)) / 10_000);
  return { pot, operation, shelter, winner: pot - operation - shelter };
}

export function FeeTable({ entry, cfg }: { entry: number; cfg: NetConfig | null }) {
  const s = splitFrom(cfg, entry);
  return (
    <table className="fee-table" aria-label="Reparto del fondo">
      <caption>Reparto con entrada de {fmtD(entry)} DINO</caption>
      <tbody>
        <tr><th>Ganador recibe</th><td>{fmtD(s.winner)}</td></tr>
        <tr><th>Operación del proyecto</th><td>{fmtD(s.operation)}</td></tr>
        <tr><th>Refugio comunitario</th><td>{fmtD(s.shelter)}</td></tr>
        <tr className="total"><th>Total aportado</th><td>{fmtD(s.pot)}</td></tr>
      </tbody>
      <tfoot>
        <tr><td colSpan={2}>Ganancia neta del ganador: +{fmtD(s.winner - entry)}. El perdedor pierde solo su entrada ({fmtD(entry)}). Comisión total: {((cfg?.operationBp ?? 250) + (cfg?.shelterBp ?? 250)) / 100} % del fondo.</td></tr>
      </tfoot>
    </table>
  );
}

export function Rules({ cfg }: { cfg: NetConfig | null }) {
  const tie = cfg?.tieMarginMs ?? 500;
  return (
    <ul className="rules">
      <li>Los aportes quedan <strong>bloqueados antes de empezar</strong>. El fondo no baja con el tiempo.</li>
      <li>Gana quien envíe primero un recorrido correcto, según el <strong>reloj del servidor</strong> (no el de tu dispositivo).</li>
      <li><strong>Empate:</strong> si ambos terminan con menos de {tie} ms de diferencia, se devuelven los aportes.</li>
      <li><strong>Devolución sin comisión:</strong> si nadie completa el desafío, si la sala no se llena en 5 minutos, si se cancela antes de empezar o si el sistema no puede verificar el resultado.</li>
      <li>Si te desconectas, <strong>el cronómetro sigue</strong>; puedes reconectarte. El rival no gana solo porque te desconectes: debe completar el desafío.</li>
      <li>Equivocarte en un recorrido gasta tiempo, pero <strong>no cuesta DINO</strong>.</li>
    </ul>
  );
}

export function ProtoBadge() {
  return <span className="proto-badge" title="Todo es simulado: sin contratos, billeteras ni dinero real">Prototipo — DINO de prueba</span>;
}
