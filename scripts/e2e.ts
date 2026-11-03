/**
 * Prueba de extremo a extremo contra el servidor en marcha (npm run server):
 * dos jugadores crean y juegan un duelo real por WebSocket.
 */
import WebSocket from 'ws';
import { makeVariant, exitOptions } from '../src/levels/variants';
import { boardFromPlacements, simulate } from '../src/game/engine';
import type { Level } from '../src/game/types';

const URL = process.env.URL ?? 'ws://localhost:8787/ws';

class Client {
  ws!: WebSocket;
  seq = 0;
  pend = new Map<number, (m: { ok: boolean; data: unknown; error?: string }) => void>();
  view: any = null;
  me: any = null;
  constructor(public name: string) {}
  async open() {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.push === 'view') this.view = m.data;
      else if (m.id) this.pend.get(m.id)?.(m);
    });
    await new Promise((r) => this.ws.once('open', r));
    this.me = await this.call('hello', { token: null, name: this.name, dev: true });
  }
  call(op: string, args: Record<string, unknown> = {}): Promise<any> {
    return new Promise((res, rej) => {
      const id = ++this.seq;
      this.pend.set(id, (m) => (m.ok ? res(m.data) : rej(new Error(m.error))));
      this.ws.send(JSON.stringify({ id, op, ...args }));
    });
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('•', ...a);

const A = new Client('Ana');
const B = new Client('Beto');
await A.open();
await B.open();
await wait(200);
log('saldos iniciales', A.view.wallet.available, B.view.wallet.available);

const { code } = await A.call('room.create', { levelId: 1, entry: 1000 });
await B.call('room.join', { code });
await A.call('room.ready', { ready: true });
await B.call('room.ready', { ready: true });
await wait(300);
log('estado sala', A.view.room.status, 'bloqueado', A.view.wallet.locked);
const lv: Level = A.view.room.level;
if (!lv || lv.solution.length === 0) throw new Error('El nivel no llegó (modo dev debería enviar solución)');
const board = boardFromPlacements(lv, lv.solution);
const exit = exitOptions(lv).find((e) => simulate(lv, board, e).outcome === 'success')!;
const sub = { placements: lv.solution.map((t) => ({ x: t.x, y: t.y, type: t.type, rot: t.rot })), exit };
const ver = makeVariant(1, 0); // comprobación local de que el módulo compartido carga
void ver;
const wait2 = A.view.room.startAt - Date.now();
await wait(Math.max(0, wait2) + 9000);
const r = await A.call('match.submit', { sub });
log('envío de Ana', r);
await wait(1200);
const o = A.view.room.outcome;
log('resultado', o.kind, 'ganador', o.winnerId === A.me.id ? 'Ana' : 'Beto');
log('saldos finales', A.view.wallet.available, A.view.wallet.locked, B.view.wallet.available, B.view.wallet.locked);
log('refugio', A.view.shelter.rescues, A.view.shelter.funds, 'conservación', A.view.shelter.conservation);
if (A.view.wallet.available !== 10_900 || B.view.wallet.available !== 9000) throw new Error('Saldos incorrectos');
console.log('✔ duelo de extremo a extremo correcto');
process.exit(0);
