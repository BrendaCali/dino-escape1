import assert from 'node:assert/strict';
import { LEVEL_SOURCES } from '../src/levels/levelData';
import { buildLevel } from '../src/levels/builder';
import {
  boardFromPlacements,
  cellMap,
  countPlaced,
  emptyBoard,
  simulate,
  simulateWithStarts,
  traceDino,
} from '../src/game/engine';
import { PIECE_TYPES } from '../src/game/types';
import type { DinoId, ExitConfig, Level, PieceType } from '../src/game/types';
import { applyCompletion, emptyLedger, pendingReward } from '../src/rewards/rewardRules';
import { GameSession } from '../src/game/session';

const verbose = process.argv.includes('--map');
let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks++;
  assert.ok(cond, msg);
};

const GLYPH: Record<PieceType, string[]> = {
  straight: ['│', '─', '│', '─'],
  curve: ['└', '┌', '┐', '┘'],
  tee: ['┬', '┤', '┴', '├'],
  bridge: ['┼', '┼', '┼', '┼'],
};

function printLevel(level: Level, board = boardFromPlacements(level, level.solution)) {
  const n = level.size;
  const cells = cellMap(level);
  const lines: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const c = cells.get(y * n + x);
      const t = board[y * n + x];
      if (c?.kind === 'rock') row += '#';
      else if (c?.kind === 'start') row += c.def.dino === 'green' ? 'G' : 'O';
      else if (c?.kind === 'home') row += c.def.dino === 'green' ? 'g' : 'o';
      else if (c?.kind === 'portal') row += c.pairId === 'A' ? 'α' : 'β';
      else if (c?.kind === 'fixed') row += GLYPH[c.tile.type][c.tile.rot % 4].replace(/./, (ch) => ch) ;
      else if (t) row += GLYPH[t.type][t.rot % 4];
      else row += '·';
    }
    lines.push(row);
  }
  console.log(lines.join('\n'));
}

const exitOptions = (level: Level): ExitConfig[] => {
  if (level.dinos.length === 1) return [{ first: level.dinos[0], delay: 0 }];
  const list: ExitConfig[] = [];
  for (const first of level.dinos as DinoId[]) {
    list.push({ first, delay: 'after' });
    for (let s = 1; s <= 10; s++) list.push({ first, delay: s });
  }
  return list;
};

// ---------- Niveles ----------
const levels = LEVEL_SOURCES.map(buildLevel);
ok(levels.length === 9, 'Debe haber nueve niveles');

const expected: Record<number, { size: number; time: number; dinos: number; inv: number[] }> = {
  1: { size: 5, time: 120, dinos: 1, inv: [5, 4, 0, 0] },
  2: { size: 6, time: 150, dinos: 1, inv: [7, 6, 0, 0] },
  3: { size: 7, time: 180, dinos: 1, inv: [8, 7, 0, 0] },
  4: { size: 8, time: 210, dinos: 1, inv: [10, 8, 2, 0] },
  5: { size: 10, time: 240, dinos: 1, inv: [13, 10, 2, 1] },
  6: { size: 12, time: 300, dinos: 1, inv: [17, 13, 3, 2] },
  7: { size: 15, time: 360, dinos: 2, inv: [24, 18, 4, 2] },
  8: { size: 20, time: 420, dinos: 2, inv: [28, 22, 4, 3] },
  9: { size: 25, time: 540, dinos: 2, inv: [36, 28, 6, 4] },
};

for (const lv of levels) {
  const e = expected[lv.id];
  const tag = `Nivel ${lv.id}`;
  ok(lv.size === e.size && lv.timeSec === e.time && lv.dinos.length === e.dinos, `${tag}: tablero/tiempo/dinos`);
  ok(PIECE_TYPES.every((t, i) => lv.inventory[t] === e.inv[i]), `${tag}: inventario`);
  const src = LEVEL_SOURCES.find((s) => s.id === lv.id)!;
  ok(lv.fixed.length === (src.fixedCells?.length ?? 0), `${tag}: todas las piezas fijas están sobre la ruta (${lv.fixed.length}/${src.fixedCells?.length ?? 0})`);

  const board = boardFromPlacements(lv, lv.solution);
  const used = countPlaced(board);
  if (verbose) {
    console.log(`\n== Nivel ${lv.id} ${lv.name} ==  usa ${PIECE_TYPES.map((t) => `${t}:${used[t]}/${lv.inventory[t]}`).join(' ')}  fijas:${lv.fixed.length} piedras:${lv.rocks.length}`);
    printLevel(lv);
  }
  for (const t of PIECE_TYPES) ok(used[t] <= lv.inventory[t], `${tag}: la solución usa ${used[t]} ${t} y solo hay ${lv.inventory[t]}`);

  // La solución no pisa casillas bloqueadas
  const cm = cellMap(lv);
  for (const p of lv.solution) ok(!cm.has(p.y * lv.size + p.x), `${tag}: pieza sobre casilla bloqueada ${p.x},${p.y}`);

  // Solución válida con alguna configuración de salida
  let best: { cfg: ExitConfig; end: number }[] = [];
  for (const cfg of exitOptions(lv)) {
    const sim = simulate(lv, board, cfg);
    if (sim.outcome === 'success') best.push({ cfg, end: sim.endTick });
  }
  ok(best.length > 0, `${tag}: la solución de referencia no llega a los refugios`);
  if (verbose || lv.dinos.length === 2) {
    best.sort((a, b) => a.end - b.end);
    const byOrder = new Map<string, number>();
    for (const b of best) if (!byOrder.has(b.cfg.first)) byOrder.set(b.cfg.first, b.end);
    console.log(`Nivel ${lv.id}: ${best.length}/${exitOptions(lv).length} configs válidas; mejor final por orden:`, Object.fromEntries(byOrder));
  }

  if (lv.dinos.length === 2) {
    const bests = new Map<string, number>();
    for (const b of best) if (!bests.has(b.cfg.first) || bests.get(b.cfg.first)! > b.end) bests.set(b.cfg.first, b.end);
    ok(bests.size === 2 && new Set(bests.values()).size === 2, `${tag}: el orden de salida no cambia el tiempo final`);
  }
}

// Reglas específicas
{
  const L = (id: number) => levels.find((l) => l.id === id)!;
  ok(L(1).rocks.length === 0, 'Nivel 1 sin piedras');
  ok(L(2).rocks.length === 4, 'Nivel 2 con cuatro piedras');
  ok(L(3).rocks.length === 7, 'Nivel 3 con siete piedras');
  ok(L(4).fixed.length === 2 && L(4).solution.filter((p) => p.type === 'tee').length === 2, 'Nivel 4: dos fijas y dos T');
  ok(L(5).solution.some((p) => p.type === 'bridge'), 'Nivel 5 usa puente');
  {
    // El puente del nivel 5 se cruza por los dos ejes en momentos distintos
    const lv = L(5);
    const tr = traceDino(lv, boardFromPlacements(lv, lv.solution), 'green');
    const bridge = lv.solution.find((p) => p.type === 'bridge')!;
    const axes = new Set<string>();
    tr.steps.forEach((s, i) => {
      if (s.x === bridge.x && s.y === bridge.y && i > 0) axes.add(tr.steps[i - 1].x !== s.x ? 'h' : 'v');
    });
    ok(axes.size === 2, 'Nivel 5: el puente debe usarse en ambos ejes');
  }
  ok(L(7).dinos.length === 2 && L(8).dinos.length === 2 && L(9).dinos.length === 2, 'Niveles 7-9 con dos dinos');
  ok(L(8).portals.length === 2, 'Nivel 8 con dos pares de portales');
  ok(L(8).portals.some((p) => p.a.y > p.b.y || p.b.y > p.a.y), 'Nivel 8 con salto vertical');
  ok(L(8).portals.some((p) => Math.abs(p.a.y - p.b.y) > 5), 'Nivel 8: un par salta de abajo hacia arriba');
  ok(L(9).portals.length >= 1 && L(9).fixed.length > 0 && L(9).rocks.length > 0 && L(9).solution.some((p) => p.type === 'bridge'), 'Nivel 9 combina portales, puentes, rocas y fijas');
}

// ---------- Motor: casos sintéticos ----------
{
  // Choque frontal por intercambio y por misma casilla
  const tiny: Level = {
    id: 99, name: 't', difficulty: '', note: '', size: 6, timeSec: 60, teeArrow: 'stem',
    inventory: { straight: 9, curve: 9, tee: 9, bridge: 9 },
    dinos: ['green', 'orange'],
    starts: [{ dino: 'green', x: 0, y: 0, dir: 1 }, { dino: 'orange', x: 5, y: 0, dir: 3 }],
    homes: [{ dino: 'green', x: 0, y: 5, dir: 0 }, { dino: 'orange', x: 5, y: 5, dir: 0 }],
    portals: [], rocks: [], fixed: [], solution: [], routes: [],
  };
  const row = boardFromPlacements(tiny, [1, 2, 3, 4].map((x) => ({ x, y: 0, type: 'straight' as const, rot: 1 })));
  const sim = simulateWithStarts(tiny, row, { green: 0, orange: 0 });
  ok(sim.outcome === 'fail' && sim.event?.type === 'collision', 'Choque frontal detectado');
  ok(sim.event!.tick === 2.5, 'El choque por intercambio ocurre entre casillas');
  const none = simulateWithStarts(tiny, emptyBoard(tiny), { green: 0, orange: 0 });
  ok(none.event?.type === 'fail' && none.event.reason === 'cut', 'Camino cortado registrado');
  // Compartir casilla en momentos distintos: una T que une dos ramales en una misma salida
  const merge: Level = {
    ...tiny, size: 5, teeArrow: 'left',
    starts: [{ dino: 'green', x: 0, y: 2, dir: 1 }, { dino: 'orange', x: 2, y: 0, dir: 2 }],
    homes: [{ dino: 'green', x: 4, y: 2, dir: 3 }, { dino: 'orange', x: 4, y: 4, dir: 0 }],
  };
  // T en (2,2): abre W, N y E; flecha 'right' -> base Este, rot 0 apunta Este... orientamos para que abra N, W, E
  const mb = boardFromPlacements(merge, [
    { x: 1, y: 2, type: 'straight', rot: 1 },
    { x: 2, y: 1, type: 'straight', rot: 0 },
    { x: 2, y: 2, type: 'tee', rot: 2 },
    { x: 3, y: 2, type: 'straight', rot: 1 },
  ]);
  const s0 = simulateWithStarts(merge, mb, { green: 0, orange: 0 });
  ok(s0.event?.type === 'collision' && s0.event.tick === 2, 'Dos dinos en la misma casilla al mismo tiempo chocan');
  const s1 = simulateWithStarts(merge, mb, { green: 0, orange: 6 });
  ok(s1.event?.type === 'fail' && s1.event.reason === 'wrong-home', 'En momentos distintos no chocan (falla por refugio incorrecto)');
  // Bucle
  const loopLv: Level = {
    ...tiny, size: 4, teeArrow: 'left', dinos: ['green'], starts: [{ dino: 'green', x: 0, y: 1, dir: 1 }],
    homes: [{ dino: 'green', x: 3, y: 3, dir: 0 }],
  };
  const lb = boardFromPlacements(loopLv, [
    { x: 1, y: 1, type: 'tee', rot: 1 }, // abre S, O y N; la flecha apunta al Norte
    { x: 1, y: 0, type: 'curve', rot: 1 },
    { x: 2, y: 0, type: 'curve', rot: 2 },
    { x: 2, y: 1, type: 'straight', rot: 0 },
    { x: 2, y: 2, type: 'curve', rot: 3 },
    { x: 1, y: 2, type: 'curve', rot: 0 },
  ]);
  const lp = traceDino(loopLv, lb, 'green');
  ok(lp.outcome === 'fail' && lp.fail!.reason === 'loop', 'Bucle detectado');
}

// ---------- Recompensas ----------
{
  ok(pendingReward(120, 120, 0) === 100, 'Premio máximo');
  ok(pendingReward(60, 120, 0) === 50, 'Mitad del tiempo');
  ok(pendingReward(60, 120, 2) === 30, 'Penalización por intentos');
  ok(pendingReward(6, 120, 3) === 0, 'Nunca negativo');
  let ledger = emptyLedger();
  const a = applyCompletion(ledger, { levelId: 1, remainingSec: 60, totalSec: 120, failedAttempts: 1, dinosRescued: 1 });
  ok(a.awarded === 40 && a.ledger.balance === 40, 'Premio sumado una vez');
  ledger = a.ledger;
  const b = applyCompletion(ledger, { levelId: 1, remainingSec: 110, totalSec: 120, failedAttempts: 0, dinosRescued: 1 });
  ok(b.awarded === 0 && b.alreadyClaimed && b.ledger.balance === 40, 'No se cobra dos veces el mismo nivel');
}

// ---------- Sesión de juego ----------
{
  const lv = levels[0];
  const s = new GameSession(lv, { claimed: false });
  const t0 = 1000;
  ok(s.snapshot().phase === 'ready', 'Empieza en "listo"');
  s.placeAt(0, 0, t0); // bloqueado hasta comenzar
  ok(countPlaced(s.board).straight === 0, 'No se edita antes de comenzar');
  s.begin(t0);
  s.select('straight');
  s.placeAt(1, 1, t0);
  ok(s.left.straight === lv.inventory.straight - 1, 'El inventario se actualiza al colocar');
  s.placeAt(0, 1, t0); // salida
  s.placeAt(4, 3, t0); // refugio
  ok(countPlaced(s.board).straight === 1, 'No se coloca sobre salidas ni refugios');
  s.undo();
  ok(s.left.straight === lv.inventory.straight, 'Deshacer devuelve la pieza');
  s.placeAt(1, 1, t0);
  s.setTool('remove');
  s.placeAt(1, 1, t0);
  ok(s.left.straight === lv.inventory.straight, 'Recuperar devuelve la pieza');
  s.setTool('place');
  s.select('straight');
  s.placeAt(1, 1, t0);
  s.clear();
  ok(countPlaced(s.board).straight === 0, 'Limpiar vacía el tablero');
  // Resolver con la solución y comprobar la recompensa
  for (const p of lv.solution) {
    s.select(p.type);
    while (s.sel!.rot !== p.rot) s.rotate(1);
    s.placeAt(p.x, p.y, t0);
  }
  s.run(t0 + 1000);
  s.update(t0 + 1000 + 60_000);
  const snap = s.snapshot();
  ok(snap.phase === 'celebrating' || snap.phase === 'won', 'La partida termina en victoria');
  s.update(t0 + 1000 + 62_000);
  ok(s.snapshot().phase === 'won', 'Pantalla de victoria');
  ok(s.result!.remainingSec > 0 && s.result!.remainingSec < lv.timeSec, 'Tiempo restante registrado');
  // Derrota por tiempo
  const s2 = new GameSession(lv, { claimed: false });
  s2.begin(0);
  s2.update(lv.timeSec * 1000 + 10);
  ok(s2.snapshot().phase === 'losing', 'Al agotarse el tiempo comienzan las bombas');
  s2.placeAt(1, 1, lv.timeSec * 1000 + 20);
  ok(countPlaced(s2.board).straight === 0, 'Sin edición durante la derrota');
  s2.update(lv.timeSec * 1000 + 20_000);
  ok(s2.snapshot().phase === 'lost', 'Pantalla de derrota');
  s2.dispose();
  s.dispose();
}

console.log(`\n✔ ${checks} comprobaciones superadas`);
