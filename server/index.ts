/**
 * Servidor del prototipo: WebSocket en /ws (acciones y estado), y sirve `dist/` si existe.
 * Ejecutar con `npm run server` (desarrollo) o `npm start` (compila el cliente y sirve todo).
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { CONFIG } from './config';
import { World, WorldError } from './world';
import type { Persisted } from './world';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dataFile = join(root, 'server', 'data', 'state.json');
const world = new World();
try {
  if (existsSync(dataFile)) world.restore(JSON.parse(readFileSync(dataFile, 'utf8')) as Persisted);
} catch (e) {
  console.warn('No se pudo restaurar el estado:', (e as Error).message);
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const dist = join(root, 'dist');

const http = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, dev: CONFIG.dev, conservation: world.ledger.total() === 0 }));
    return;
  }
  const safe = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  const file = join(dist, safe);
  if (!file.startsWith(dist) || !existsSync(file)) {
    res.writeHead(existsSync(dist) ? 404 : 200, { 'content-type': 'text/plain; charset=utf-8' }).end(existsSync(dist) ? 'No encontrado' : 'Servidor de Dino Escape activo. Ejecuta "npm run dev" para el cliente o "npm start" para servirlo aquí.');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});

interface Conn {
  playerId: string | null;
  dev: boolean;
  seen: number;
  stamps: number[];
}
const conns = new Map<WebSocket, Conn>();
const wss = new WebSocketServer({ server: http, path: '/ws' });

const send = (ws: WebSocket, m: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
const push = (ws: WebSocket, c: Conn) => {
  if (!c.playerId) return;
  c.seen = world.version;
  send(ws, { push: 'view', data: world.view(c.playerId, c.dev && CONFIG.dev) });
};
const pushAll = () => {
  for (const [ws, c] of conns) if (c.playerId && c.seen !== world.version) push(ws, c);
};

wss.on('connection', (ws) => {
  const c: Conn = { playerId: null, dev: false, seen: -1, stamps: [] };
  conns.set(ws, c);
  ws.on('message', (raw) => {
    const now = Date.now();
    c.stamps = c.stamps.filter((t) => now - t < CONFIG.rate.windowMs);
    if (c.stamps.length >= CONFIG.rate.maxMessages) return send(ws, { error: 'Demasiados mensajes por segundo.' });
    c.stamps.push(now);
    let m: { id?: number; op?: string; [k: string]: unknown };
    try {
      m = JSON.parse(String(raw));
    } catch {
      return send(ws, { error: 'Mensaje inválido.' });
    }
    const reply = (data: unknown) => send(ws, { id: m.id, ok: true, data });
    const err = (e: unknown) => send(ws, { id: m.id, ok: false, error: e instanceof WorldError ? e.message : 'Error interno del servidor.' });
    try {
      if (m.op === 'hello') {
        const p = world.hello((m.token as string) ?? null, String(m.name ?? ''));
        if (c.playerId && c.playerId !== p.id) world.setConnected(c.playerId, false);
        c.playerId = p.id;
        c.dev = !!m.dev;
        world.setConnected(p.id, true);
        reply({ id: p.id, token: p.token, name: p.name, serverDev: CONFIG.dev, config: { entry: CONFIG.entryOptions, tieMarginMs: CONFIG.tieMarginMs, roomWaitMs: CONFIG.roomWaitMs, operationBp: CONFIG.operationBp, shelterBp: CONFIG.shelterBp, goalRescues: CONFIG.shelter.goalRescues, levels: world.levelsInfo() } });
      } else if (!c.playerId) throw new WorldError('Primero identifícate.');
      else {
        const id = c.playerId;
        let out: unknown = {};
        switch (m.op) {
          case 'room.create': out = { code: world.createRoom(id, Number(m.levelId), Number(m.entry)) }; break;
          case 'room.join': world.joinRoom(id, String(m.code ?? '')); break;
          case 'room.leave': world.leaveRoom(id); break;
          case 'room.ready': world.setReady(id, !!m.ready); break;
          case 'match.phase': world.setPhase(id, m.phase as 'building' | 'running'); break;
          case 'match.submit': out = world.submitMatch(id, m.sub); break;
          case 'event.register': world.eventRegister(id); break;
          case 'event.start': out = { level: world.eventStart(id) }; break;
          case 'event.submit': out = world.eventSubmit(id, m.sub); break;
          case 'dev': world.dev(id, String(m.action), Number(m.arg ?? 0)); break;
          case 'ping': break;
          default: throw new WorldError('Operación desconocida.');
        }
        reply(out);
      }
      pushAll();
    } catch (e) {
      if (!(e instanceof WorldError)) console.error(e);
      err(e);
    }
  });
  ws.on('close', () => {
    if (c.playerId) world.setConnected(c.playerId, false);
    conns.delete(ws);
    pushAll();
  });
});

setInterval(() => {
  try {
    world.tick();
  } catch (e) {
    console.error('tick', e);
  }
  pushAll();
}, 250);

let saved = -1;
setInterval(() => {
  if (saved === world.version) return;
  saved = world.version;
  try {
    mkdirSync(join(root, 'server', 'data'), { recursive: true });
    writeFileSync(dataFile, JSON.stringify(world.serialize()));
  } catch (e) {
    console.warn('No se pudo guardar:', (e as Error).message);
  }
}, 1000);

http.listen(CONFIG.port, () => console.log(`Dino Escape · servidor en http://localhost:${CONFIG.port} (desarrollo: ${CONFIG.dev})`));
