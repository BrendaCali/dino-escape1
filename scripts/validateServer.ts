import assert from 'node:assert/strict';
import { World } from '../server/world';
import { CONFIG, dino, splitPot } from '../server/config';
import { Ledger } from '../server/ledger';
import { makeVariant, exitOptions, referenceSolves } from '../src/levels/variants';
import { boardFromPlacements, simulate } from '../src/game/engine';
import type { Level } from '../src/game/types';

let checks = 0;
const ok = (c: unknown, m: string) => {
  checks++;
  assert.ok(c, m);
};
const throws = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

let now = 1_000_000;
const mk = () => new World(() => now);
const answer = (lv: Level) => {
  const board = boardFromPlacements(lv, lv.solution);
  const exit = exitOptions(lv).find((e) => simulate(lv, board, e).outcome === 'success')!;
  return { placements: lv.solution.map((t) => ({ x: t.x, y: t.y, type: t.type, rot: t.rot })), exit };
};
const roomOf = (w: World, pid: string) => w.roomView(pid, true)!;
const levelOf = (w: World, code: string) => (w.rooms.get(code) as unknown as { level: Level }).level;
const duelStart = (w: World, a: string, b: string, levelId = 1) => {
  const code = w.createRoom(a, levelId, dino(10));
  w.joinRoom(b, code);
  w.setReady(a, true);
  w.setReady(b, true);
  now += CONFIG.countdownMs + 1;
  return code;
};
/** Duelo en el que gana `a`. */
const winDuel = (w: World, a: string, b: string, levelId = 1) => {
  const code = duelStart(w, a, b, levelId);
  now += 30_000;
  w.submitMatch(a, answer(levelOf(w, code)));
  now += CONFIG.tieMarginMs + 100;
  w.tick();
  return code;
};

// ---- Variantes ----
for (let id = 1; id <= 9; id++) for (const seed of [0, 1, 2, 3, 12345]) ok(referenceSolves(makeVariant(id, seed)), `Variante verificada nivel ${id} semilla ${seed}`);
ok(JSON.stringify(makeVariant(4, 0).rocks) !== JSON.stringify(makeVariant(4, 1).rocks), 'Las variantes cambian el tablero');

// ---- Libro mayor ----
const L = new Ledger();
L.settle('a', [{ kind: 'grant', from: 'mint', to: 'p:x', amount: 100, note: '' }]);
ok(!L.settle('a', [{ kind: 'grant', from: 'mint', to: 'p:x', amount: 100, note: '' }]), 'Una liquidación no se aplica dos veces');
ok(throws(() => L.settle('b', [{ kind: 'x', from: 'p:x', to: 'p:y', amount: 101, note: '' }])), 'No se gasta más de lo disponible');
ok(L.bal('p:x') === 100 && L.total() === 0, 'El libro conserva la suma');
const sp = splitPot(dino(10));
ok(sp.winner === 1900 && sp.operation === 50 && sp.shelter === 50, 'Reparto 19 / 0,5 / 0,5 con enteros');

// ---- Duelo completo ----
{
  const w = mk();
  const A = w.hello(null, 'Ana');
  const B = w.hello(null, 'Beto');
  const code = duelStart(w, A.id, B.id);
  ok(w.wallet(A.id).locked === 1000 && w.wallet(A.id).available === 9000, 'La entrada queda bloqueada antes de empezar');
  ok(throws(() => w.createRoom(A.id, 1, 1000)), 'No se puede abrir otra sala con saldo bloqueado');
  const lv = levelOf(w, code);
  ok(roomOf(w, A.id).players.every((p) => ['desconectado', 'building', 'running', 'finished'].includes(p.state)), 'Del rival solo se ve su estado');
  ok(roomOf(w, A.id).level!.solution.length > 0 && w.roomView(A.id, false)!.level!.solution.length === 0, 'La solución solo se envía en modo desarrollo');
  now += 30_000;
  ok(w.submitMatch(A.id, answer(lv)).ok, 'Un envío correcto se acepta');
  ok(w.submitMatch(B.id, { placements: [], exit: { first: 'green', delay: 0 } }).ok === false, 'Un camino vacío se rechaza');
  w.tick();
  ok(roomOf(w, A.id).status === 'racing', 'Se espera el margen de empate antes de liquidar');
  now += 600;
  w.tick();
  const out = roomOf(w, A.id).outcome!;
  ok(out.kind === 'win' && out.winnerId === A.id, 'Gana el primer resultado correcto');
  ok(w.wallet(A.id).available === 10_900 && w.wallet(B.id).available === 9000 && w.wallet(B.id).locked === 0, 'Ganador +9 netos, perdedor -10');
  ok(w.ledger.bal('operation') === 50 && w.ledger.bal('shelter') === 50 && w.shelter.rescues === 1, 'Operación 0,5, refugio 0,5 y 1 rescate');
  const before = JSON.stringify(w.ledger.toJSON().balances);
  w.tick();
  ok(JSON.stringify(w.ledger.toJSON().balances) === before, 'La liquidación no se repite');
  ok(w.ledger.total() === 0, 'Conservación de fondos');
}

// ---- Devoluciones sin comisión ----
{
  const w = mk();
  const A = w.hello(null, 'A');
  const B = w.hello(null, 'B');
  const c = w.createRoom(A.id, 1, 1000);
  w.joinRoom(B.id, c);
  w.leaveRoom(B.id);
  ok(w.wallet(B.id).available === 10_000 && roomOf(w, A.id).players.length === 1, 'El invitado que sale recupera su aporte');
  w.leaveRoom(A.id);
  ok(w.wallet(A.id).available === 10_000, 'Cancelar la sala devuelve el aporte');
  const c2 = w.createRoom(A.id, 1, 1000);
  w.joinRoom(B.id, c2);
  now += CONFIG.roomWaitMs + 1;
  w.tick();
  ok(w.wallet(A.id).available === 10_000 && w.wallet(B.id).available === 10_000 && w.ledger.bal('shelter') === 0, 'Sala sin completar en 5 min: devolución sin comisión');
}
{
  const w = mk();
  const A = w.hello(null, 'A');
  const B = w.hello(null, 'B');
  const code = duelStart(w, A.id, B.id, 2);
  const lv = levelOf(w, code);
  now += 40_000;
  w.submitMatch(A.id, answer(lv));
  now += 300;
  w.submitMatch(B.id, answer(lv));
  now += 300;
  w.tick();
  ok(roomOf(w, A.id).outcome!.kind === 'refund' && w.wallet(A.id).available === 10_000 && w.wallet(B.id).available === 10_000, 'Empate dentro de 500 ms: devolución');
  ok(w.shelter.rescues === 0 && w.ledger.bal('shelter') === 0, 'Un empate no suma rescate ni comisión');
}
{
  const w = mk();
  const A = w.hello(null, 'A');
  const B = w.hello(null, 'B');
  const code = duelStart(w, A.id, B.id);
  const lv = levelOf(w, code);
  now += lv.timeSec * 1000 + CONFIG.graceMs + 10;
  w.tick();
  ok(roomOf(w, A.id).outcome!.kind === 'refund' && w.wallet(B.id).available === 10_000, 'Nadie completa: devolución');
  w.leaveRoom(A.id);
  ok(w.wallet(A.id).locked === 0 && w.ledger.bal('operation') === 0, 'No queda nada bloqueado ni hay comisión');
}
{
  const w = mk();
  const A = w.hello(null, 'A');
  const B = w.hello(null, 'B');
  const code = duelStart(w, A.id, B.id);
  const good = answer(levelOf(w, code));
  ok(!w.submitMatch(A.id, { ...good, placements: [...good.placements, ...good.placements] }).ok, 'Piezas duplicadas se rechazan');
  ok(!w.submitMatch(A.id, { ...good, placements: good.placements.slice(1) }).ok, 'Un camino incompleto se rechaza');
  ok(!w.submitMatch(B.id, good).ok, 'Un resultado instantáneo se marca como imposible');
}

// ---- Refugio y evento ----
{
  const w = mk();
  const P = [w.hello(null, 'A'), w.hello(null, 'B'), w.hello(null, 'C'), w.hello(null, 'D')];
  w.dev(P[0].id, 'preload', 0);
  ok(w.shelter.rescues === 99 && w.ledger.bal('shelter') === 4950 && w.shelterView().preloaded, 'Precarga de demostración: 99 rescates y 49,5 DINO');
  winDuel(w, P[0].id, P[1].id);
  ok(w.event?.phase === 'registration' && w.ledger.bal('event') === 5000 && w.ledger.bal('shelter') === 0 && w.shelter.rescues === 0, 'El duelo 100 abre el evento con 50 DINO reservados');
  ok(w.shelterView().stage === 5, 'Refugio completo mientras dura el evento');
  [P[0], P[1], P[2]].forEach((p) => w.eventRegister(p.id));
  ok(throws(() => w.eventStart(P[0].id)), 'No hay intento durante las inscripciones');
  w.leaveRoom(P[0].id);
  w.leaveRoom(P[1].id);
  winDuel(w, P[2].id, P[3].id);
  ok(w.shelter.rescues === 1 && w.ledger.bal('event') === 5000 && w.ledger.bal('shelter') === 50, 'Las nuevas comisiones esperan al siguiente ciclo');
  w.dev(P[0].id, 'advance', 0);
  ok(w.event!.phase === 'attempts', 'Se pueden acelerar los plazos del evento');
  const ev = w.event!;
  const ans = answer(ev.level);
  const attempt = (id: string, wait: number) => {
    const e = w.eventStart(id);
    ok(e.id === ev.level.id && e.rocks.length === ev.level.rocks.length, 'Mismo desafío para todos');
    now += wait;
    return w.eventSubmit(id, ans);
  };
  const before0 = w.wallet(P[0].id).available;
  ok(attempt(P[0].id, 60_000).ok, 'Participante 1 termina');
  ok(attempt(P[1].id, 90_000).ok, 'Participante 2 termina');
  ok(throws(() => w.eventStart(P[0].id)), 'Un solo intento por cuenta');
  ok(w.eventView(P[1].id, false).active!.finished === 2 && w.eventView(P[2].id, false).last === null, 'Clasificación oculta hasta el cierre');
  w.dev(P[0].id, 'advance', 0);
  const last = w.eventView(P[0].id, false).last!;
  ok(w.event === null && last.results!.length === 2, 'El evento cierra');
  ok(last.results![0].prize === 2500 && last.results![1].prize === 1500 && w.wallet(P[0].id).available === before0 + 2500, 'Premios 25 y 15 del fondo reservado');
  ok(last.returned === 1000 && w.ledger.bal('event') === 0, 'El tercer premio sin ocupar regresa al refugio');
  ok(w.ledger.bal('shelter') === 1050, 'Refugio: 0,5 del siguiente ciclo + 10 devueltos');
  ok(w.ledger.total() === 0, 'Conservación de fondos tras el evento');
  ok(last.results!.reduce((a, r) => a + r.prize, 0) <= 5000, 'El evento no paga más de lo reservado');
}
{
  const w = mk();
  const A = w.hello(null, 'A');
  const B = w.hello(null, 'B');
  w.dev(A.id, 'preload', 0);
  winDuel(w, A.id, B.id);
  w.eventRegister(A.id);
  w.dev(A.id, 'advance', 0);
  w.dev(A.id, 'advance', 0);
  ok(w.event === null && w.ledger.bal('shelter') === 5000 && w.ledger.bal('event') === 0, 'Si nadie termina regresan los 50 DINO');
}
console.log(`✔ ${checks} comprobaciones del servidor superadas`);
