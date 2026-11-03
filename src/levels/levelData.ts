import type { LevelSource } from '../game/types';

/**
 * CONFIGURACIÓN EDITABLE DE LOS NIVELES
 * - timeSec: tiempo total en segundos.
 * - inventory: [rectas, curvas, cruces en T, puentes].
 * - routes: ruta de referencia (puntos de paso). De aquí se deriva la solución, que
 *   `npm run validate` simula con el motor real para garantizar que el nivel es resoluble.
 * - fixedCells: casillas de la ruta que vienen ya colocadas (piezas fijas).
 * - teeCells: casillas de la ruta que usan un cruce en T. teeArrow define hacia dónde apunta su flecha.
 * - Direcciones: 0 = Norte, 1 = Este, 2 = Sur, 3 = Oeste.
 */
export const LEVEL_SOURCES: LevelSource[] = [
  {
    id: 1,
    name: 'Primeros pasos',
    difficulty: 'Tutorial de colocación y giro; sin piedras.',
    note: 'Coloca las piezas y gíralas para unir la salida con el refugio.',
    size: 5,
    timeSec: 120,
    inventory: [5, 4, 0, 0],
    teeArrow: 'stem',
    starts: [{ dino: 'green', x: 0, y: 1, dir: 1 }],
    homes: [{ dino: 'green', x: 4, y: 3, dir: 3 }],
    routes: [{ dino: 'green', legs: [[[0, 1], [2, 1], [2, 3], [4, 3]]] }],
  },
  {
    id: 2,
    name: 'Rodea las rocas',
    difficulty: 'Cuatro piedras bloquean la ruta directa.',
    note: 'La ruta directa está bloqueada: busca el desvío.',
    size: 6,
    timeSec: 150,
    inventory: [7, 6, 0, 0],
    teeArrow: 'stem',
    starts: [{ dino: 'green', x: 0, y: 2, dir: 1 }],
    homes: [{ dino: 'green', x: 5, y: 2, dir: 3 }],
    rocks: [[2, 2], [3, 2], [2, 3], [3, 3]],
    routes: [{ dino: 'green', legs: [[[0, 2], [1, 2], [1, 1], [4, 1], [4, 2], [5, 2]]] }],
  },
  {
    id: 3,
    name: 'Piezas contadas',
    difficulty: 'Siete piedras e inventario ajustado.',
    note: 'Cada pieza cuenta: planifica antes de colocar.',
    size: 7,
    timeSec: 180,
    inventory: [8, 7, 0, 0],
    teeArrow: 'stem',
    starts: [{ dino: 'green', x: 0, y: 3, dir: 1 }],
    homes: [{ dino: 'green', x: 6, y: 3, dir: 0 }],
    rocks: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [4, 3], [5, 3]],
    routes: [{ dino: 'green', legs: [[[0, 3], [1, 3], [1, 0], [6, 0], [6, 2], [6, 3]]] }],
  },
  {
    id: 4,
    name: 'El desvío correcto',
    difficulty: 'Cruces en T, flechas y dos piezas fijas.',
    note: 'La T deja pasar al dino y lo manda por la flecha. Dos tramos ya están puestos.',
    size: 8,
    timeSec: 210,
    inventory: [10, 8, 2, 0],
    teeArrow: 'left',
    starts: [{ dino: 'green', x: 0, y: 1, dir: 1 }],
    homes: [{ dino: 'green', x: 7, y: 6, dir: 3 }],
    rocks: [[3, 1], [3, 2], [4, 2], [4, 4], [4, 5], [6, 3], [6, 4], [6, 5], [7, 4], [0, 4], [1, 5]],
    routes: [
      { dino: 'green', legs: [[[0, 1], [2, 1], [2, 3], [5, 3], [5, 6], [7, 6]]] },
    ],
    teeCells: [[2, 3], [5, 6]],
    fixedCells: [[4, 3], [5, 5]],
  },
  {
    id: 5,
    name: 'Sobre el camino',
    difficulty: 'Un puente obligatorio y más obstáculos.',
    note: 'Tu camino se cruza consigo mismo: el puente deja pasar a distinta altura.',
    size: 10,
    timeSec: 240,
    inventory: [13, 10, 2, 1],
    teeArrow: 'left',
    starts: [{ dino: 'green', x: 0, y: 4, dir: 1 }],
    homes: [{ dino: 'green', x: 7, y: 7, dir: 3 }],
    rockRects: [[1, 5, 2, 5], [4, 5, 5, 5], [4, 6, 5, 6], [1, 2, 1, 3], [6, 1, 6, 1], [7, 3, 8, 3], [8, 4, 8, 6]],
    rocks: [[0, 6], [2, 8], [3, 9], [6, 8], [6, 9], [7, 9], [8, 8]],
    routes: [{ dino: 'green', legs: [[[0, 4], [5, 4], [5, 2], [3, 2], [3, 7], [7, 7]]] }],
    fixedCells: [[1, 4], [5, 3]],
  },
  {
    id: 6,
    name: 'El gran recorrido',
    difficulty: 'Ruta larga con piezas fijas y desvíos.',
    note: 'Una ruta larga con tramos ya construidos. Respeta las piezas fijas.',
    size: 12,
    timeSec: 300,
    inventory: [17, 13, 3, 2],
    teeArrow: 'right',
    starts: [{ dino: 'green', x: 0, y: 1, dir: 1 }],
    homes: [{ dino: 'green', x: 11, y: 10, dir: 3 }],
    routes: [
      {
        dino: 'green',
        legs: [[[0, 1], [3, 1], [3, 3], [1, 3], [1, 5], [5, 5], [5, 7], [2, 7], [2, 9], [6, 9], [6, 7], [9, 7], [9, 10], [11, 10]]],
      },
    ],
    fixedCells: [[2, 1], [2, 5], [3, 5], [4, 7], [3, 7], [6, 8], [8, 7]],
    scatter: { count: 26, seed: 6 },
  },
  {
    id: 7,
    name: 'Rescate doble',
    difficulty: 'Dos salidas, dos refugios y coordinación de recorridos.',
    note: 'Dos dinos, dos refugios. Sus caminos se cruzan: usa el puente y elige quién sale primero.',
    size: 15,
    timeSec: 360,
    inventory: [24, 18, 4, 2],
    teeArrow: 'left',
    starts: [
      { dino: 'green', x: 0, y: 10, dir: 1 },
      { dino: 'orange', x: 0, y: 3, dir: 1 },
    ],
    homes: [
      { dino: 'green', x: 8, y: 0, dir: 2 },
      { dino: 'orange', x: 14, y: 8, dir: 3 },
    ],
    routes: [
      { dino: 'green', legs: [[[0, 10], [3, 10], [3, 7], [6, 7], [6, 4], [8, 4], [8, 0]]] },
      { dino: 'orange', legs: [[[0, 3], [11, 3], [11, 8], [14, 8]]] },
    ],
    fixedCells: [[2, 3], [4, 3], [10, 3], [11, 5], [12, 8]],
    scatter: { count: 40, seed: 7 },
  },
  {
    id: 8,
    name: 'Salto espacial',
    difficulty: 'Dos pares de portales, incluyendo un salto de abajo hacia arriba.',
    note: 'Un muro de piedras parte el mapa: solo los portales cruzan. Mira el símbolo de cada pareja.',
    size: 20,
    timeSec: 420,
    inventory: [28, 22, 4, 3],
    teeArrow: 'right',
    starts: [
      { dino: 'green', x: 0, y: 17, dir: 1 },
      { dino: 'orange', x: 0, y: 8, dir: 1 },
    ],
    homes: [
      { dino: 'green', x: 1, y: 1, dir: 2 },
      { dino: 'orange', x: 18, y: 3, dir: 3 },
    ],
    portals: [
      { id: 'A', a: { x: 9, y: 14, dir: 3 }, b: { x: 4, y: 4, dir: 1 } },
      { id: 'B', a: { x: 9, y: 6, dir: 3 }, b: { x: 11, y: 6, dir: 1 } },
    ],
    rockRects: [[0, 10, 19, 10], [10, 0, 10, 9]],
    routes: [
      {
        dino: 'green',
        legs: [
          [[0, 17], [5, 17], [5, 14], [9, 14]],
          [[4, 4], [5, 4], [5, 2], [1, 2], [1, 1]],
        ],
      },
      {
        dino: 'orange',
        legs: [
          [[0, 8], [3, 8], [3, 6], [9, 6]],
          [[11, 6], [14, 6], [14, 3], [18, 3]],
        ],
      },
    ],
    fixedCells: [[3, 17], [7, 14], [2, 8], [12, 6], [16, 3]],
    scatter: { count: 70, seed: 8 },
  },
  {
    id: 9,
    name: 'La última extinción',
    difficulty: 'Combina portales, puentes, rocas, rutas compartidas y piezas fijas.',
    note: 'Todo junto: portales, puentes y dos recorridos que se cruzan. Coordina bien la salida.',
    size: 25,
    timeSec: 540,
    inventory: [36, 28, 6, 4],
    teeArrow: 'left',
    starts: [
      { dino: 'green', x: 0, y: 20, dir: 1 },
      { dino: 'orange', x: 24, y: 4, dir: 3 },
    ],
    homes: [
      { dino: 'green', x: 24, y: 8, dir: 3 },
      { dino: 'orange', x: 0, y: 5, dir: 1 },
    ],
    portals: [{ id: 'A', a: { x: 10, y: 20, dir: 3 }, b: { x: 12, y: 12, dir: 0 } }],
    rockRects: [[0, 14, 24, 14]],
    routes: [
      {
        dino: 'green',
        legs: [
          [[0, 20], [10, 20]],
          [[12, 12], [12, 6], [20, 6], [20, 8], [24, 8]],
        ],
      },
      {
        dino: 'orange',
        legs: [[[24, 4], [16, 4], [16, 10], [8, 10], [8, 5], [0, 5]]],
      },
    ],
    teeCells: [[20, 4]],
    fixedCells: [[5, 20], [12, 8], [20, 7], [16, 8], [4, 5], [10, 10], [2, 20], [7, 20], [14, 6], [15, 6], [18, 6], [22, 4], [2, 5], [6, 5], [3, 5], [9, 10]],
    scatter: { count: 110, seed: 9 },
  },
];
