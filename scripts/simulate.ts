/**
 * Simulación económica de 60 días con las reglas de server/config.ts.
 * No usa el servidor ni el motor del juego: modela cuentas con habilidad distinta que juegan duelos,
 * para ver qué pasa con los saldos y el refugio ANTES de fijar parámetros.
 *
 *   npm run simulate
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { CONFIG, splitPot } from '../server/config';

const ENTRY = CONFIG.entryOptions[0];
const SP = splitPot(ENTRY);
const S = CONFIG.shelter;
const DAYS = 60;

/** Generador pseudoaleatorio con semilla, para que los resultados se repitan. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scenario {
  name: string;
  accounts: number;
  duelsPerDay: number;
  /** Cuentas que usan script: ganan casi siempre. */
  bots: number;
  matchBySkill: boolean;
  /** Probabilidad diaria de que una cuenta con saldo juegue. */
  activity: number;
}

interface Result {
  name: string;
  broke: number;
  accounts: number;
  gini: number;
  top10: number;
  botShare: number;
  duels: number;
  counted: number;
  refunded: number;
  cycles: number;
  shelterEnd: number;
  conserved: boolean;
}

function gini(v: number[]) {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  const sum = a.reduce((x, y) => x + y, 0);
  if (!sum) return 0;
  let acc = 0;
  a.forEach((x, i) => (acc += (i + 1) * x));
  return (2 * acc) / (n * sum) - (n + 1) / n;
}

function run(sc: Scenario, seed: number): Result {
  const r = rng(seed);
  const bal: number[] = Array.from({ length: sc.accounts }, () => CONFIG.initialGrant);
  const granted = CONFIG.initialGrant * sc.accounts;
  // Habilidad: la mayoría es parecida; unos pocos son muy buenos; los bots casi siempre ganan.
  const skill = bal.map((_, i) => (i < sc.bots ? 20 : 0.5 + r() * r() * 5));
  let operation = 0;
  let shelter = 0;
  let event = 0;
  let rescues = 0;
  let cycles = 0;
  let duels = 0;
  let counted = 0;
  let refunded = 0;
  let pairs = new Map<string, number>();

  for (let day = 0; day < DAYS; day++) {
    const active = bal.map((_, i) => i).filter((i) => bal[i] >= ENTRY && r() < sc.activity);
    // Emparejamiento: por habilidad (orden) o al azar.
    const order = sc.matchBySkill ? [...active].sort((a, b) => skill[a] - skill[b]) : [...active].sort(() => r() - 0.5);
    for (let round = 0; round < sc.duelsPerDay; round++) {
      for (let k = 0; k + 1 < order.length; k += 2) {
        const a = order[k];
        const b = order[k + 1];
        if (bal[a] < ENTRY || bal[b] < ENTRY) continue;
        duels++;
        if (r() < 0.03) {
          refunded++; // empate, nadie resuelve o sala cancelada: devolución completa
          continue;
        }
        const winner = r() < skill[a] / (skill[a] + skill[b]) ? a : b;
        const loser = winner === a ? b : a;
        bal[winner] += SP.winner - ENTRY;
        bal[loser] -= ENTRY;
        const key = [a, b].sort().join('|');
        const seen = pairs.get(key) ?? 0;
        if (seen >= CONFIG.pairCap) {
          operation += SP.operation + SP.shelter; // R7: tope por par, no suma al refugio
        } else {
          pairs.set(key, seen + 1);
          operation += SP.operation;
          shelter += SP.shelter;
          rescues++;
          counted++;
        }
        if (rescues >= S.goalRescues && shelter >= S.goalFund) {
          // Evento gratis: lo juegan hasta 20 cuentas; reparte 25/15/10 por tiempo (más habilidad, más probable).
          cycles++;
          rescues -= S.goalRescues;
          pairs = new Map();
          shelter -= S.eventBudget;
          event += S.eventBudget;
          const field = active.slice(0, 20).sort((x, y) => skill[y] * (0.5 + r()) - skill[x] * (0.5 + r()));
          S.prizes.forEach((p, i) => {
            if (field[i] === undefined) {
              shelter += p; // puesto sin ocupar vuelve al refugio
              event -= p;
            } else {
              bal[field[i]] += p;
              event -= p;
            }
          });
          shelter += event; // resto del evento
          event = 0;
        }
      }
    }
  }
  const total = bal.reduce((x, y) => x + y, 0) + operation + shelter + event;
  const sorted = [...bal].sort((x, y) => y - x);
  const top = sorted.slice(0, Math.ceil(sc.accounts * 0.1)).reduce((x, y) => x + y, 0);
  const all = bal.reduce((x, y) => x + y, 0);
  const botMoney = bal.slice(0, sc.bots).reduce((x, y) => x + y, 0);
  return {
    name: sc.name,
    broke: bal.filter((b) => b < ENTRY).length,
    accounts: sc.accounts,
    gini: gini(bal),
    top10: top / all,
    botShare: sc.bots ? botMoney / all : 0,
    duels,
    counted,
    refunded,
    cycles,
    shelterEnd: shelter,
    conserved: total === granted,
  };
}

const base = { accounts: 200, duelsPerDay: 2, bots: 0, matchBySkill: false, activity: 0.5 };
const scenarios: Scenario[] = [
  { ...base, name: 'A. Base, emparejamiento al azar' },
  { ...base, name: 'B. Emparejamiento por habilidad', matchBySkill: true },
  { ...base, name: 'C. Con 10 cuentas de script, al azar', bots: 10 },
  { ...base, name: 'D. Con 10 cuentas de script, por habilidad', bots: 10, matchBySkill: true },
  { ...base, name: 'E. Comunidad pequeña (40 cuentas)', accounts: 40 },
  { ...base, name: 'F. Comunidad activa (1000 cuentas)', accounts: 1000, activity: 0.7 },
];

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const rows = scenarios.map((s) => {
  const rs = [1, 2, 3, 4, 5].map((seed) => run(s, seed));
  const avg = (f: (x: Result) => number) => rs.reduce((a, x) => a + f(x), 0) / rs.length;
  return {
    name: s.name,
    broke: avg((x) => x.broke / x.accounts),
    gini: avg((x) => x.gini),
    top10: avg((x) => x.top10),
    bot: avg((x) => x.botShare),
    duels: avg((x) => x.duels),
    counted: avg((x) => x.counted),
    cycles: avg((x) => x.cycles),
    conserved: rs.every((x) => x.conserved),
  };
});

const lines = [
  `# Simulación económica (${DAYS} días, promedio de 5 semillas)`,
  '',
  `Entrada ${ENTRY / 100} DINO, saldo inicial ${CONFIG.initialGrant / 100} DINO, tope por par ${CONFIG.pairCap}. Las cuentas de script ganan casi siempre.`,
  '',
  '| Escenario | Cuentas sin saldo | Gini | 10 % más rico tiene | Scripts tienen | Duelos | Cuentan al refugio | Eventos | Libro cuadra |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((x) => `| ${x.name} | ${pct(x.broke)} | ${x.gini.toFixed(2)} | ${pct(x.top10)} | ${pct(x.bot)} | ${x.duels.toFixed(0)} | ${x.counted.toFixed(0)} | ${x.cycles.toFixed(1)} | ${x.conserved ? 'sí' : 'NO'} |`),
  '',
  'Cómo leerlo: es un modelo simple (habilidad fija, actividad al azar, sin abandonos ni reconexión). Sirve para comparar escenarios, no para predecir.',
];
const text = lines.join('\n');
console.log(text);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/simulation.md', text + '\n');
if (rows.some((x) => !x.conserved)) {
  console.error('✘ El libro no cuadra en alguna simulación');
  process.exit(1);
}
