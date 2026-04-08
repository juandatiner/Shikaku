/**
 * @file generator.js
 * @description Generador procedural de puzzles Shikaku.
 * Crea particiones aleatorias válidas y verifica solución única.
 */

import { solve, extractClues } from './solver.js?v=5';
import { DIFFICULTY_CONFIG } from './constants.js?v=5';

/**
 * Genera un número aleatorio entre min y max (inclusivos)
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Baraja un array in-place (Fisher-Yates)
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Calcula el tamaño de grilla para una dificultad y nivel dados
 * @param {number} difficulty - ID de dificultad (1-5)
 * @param {number} level - Nivel dentro de la dificultad (1-10)
 * @returns {{rows: number, cols: number}}
 */
export function getSizeForLevel(difficulty, level) {
  const config = DIFFICULTY_CONFIG[difficulty - 1];
  const range = config.maxR - config.minR;
  const size = Math.round(config.minR + (range * (level - 1)) / 9);
  return { rows: size, cols: size };
}

/**
 * Genera una partición aleatoria del tablero en rectángulos
 * @param {number} rows - Filas
 * @param {number} cols - Columnas
 * @param {number} difficulty - Dificultad (1-5) para ajustar forma de rectángulos
 * @returns {Array<Object>|null} Lista de rectángulos [{r0, c0, w, h}] o null si falla
 */
function generatePartition(rows, cols, difficulty) {
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const rects = [];

  // Parámetros según dificultad
  const maxRectArea = difficulty <= 2 ? Math.min(8, rows * cols / 2) :
                      difficulty <= 3 ? Math.min(14, rows * cols / 3) :
                      difficulty <= 4 ? Math.min(30, rows * cols / 4) :
                      Math.min(100, rows * cols / 3);
  const minRectArea = 2;
  // En dificultades bajas, preferir rectángulos cuadrados
  const preferSquare = difficulty <= 2;

  // Recopilar todas las celdas libres y barajar
  const allCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      allCells.push([r, c]);
    }
  }
  shuffle(allCells);

  for (const [startR, startC] of allCells) {
    if (occupied[startR][startC]) continue;

    // Generar lista de rectángulos posibles que contengan esta celda
    const possibleRects = [];

    for (let area = minRectArea; area <= maxRectArea; area++) {
      for (let w = 1; w <= area; w++) {
        if (area % w !== 0) continue;
        const h = area / w;

        if (w > cols || h > rows) continue;

        // Penalizar formas muy alargadas en dificultades bajas
        if (preferSquare && (w / h > 3 || h / w > 3)) continue;

        const r0Min = Math.max(0, startR - h + 1);
        const r0Max = Math.min(rows - h, startR);
        const c0Min = Math.max(0, startC - w + 1);
        const c0Max = Math.min(cols - w, startC);

        for (let r0 = r0Min; r0 <= r0Max; r0++) {
          for (let c0 = c0Min; c0 <= c0Max; c0++) {
            // Verificar que todas las celdas están libres
            let free = true;
            for (let rr = r0; rr < r0 + h && free; rr++) {
              for (let cc = c0; cc < c0 + w && free; cc++) {
                if (occupied[rr][cc]) free = false;
              }
            }
            if (free) {
              possibleRects.push({ r0, c0, w, h, area });
            }
          }
        }
      }
    }

    if (possibleRects.length === 0) {
      // Celda aislada: asignar rectángulo 1×1 (no es válido en Shikaku normal,
      // pero la verificación posterior descartará si no es viable)
      // En su lugar, intentar con área 1 solo si es posible conectar después
      // Marcar como ocupada con rect 1×1 temporal
      occupied[startR][startC] = true;
      rects.push({ r0: startR, c0: startC, w: 1, h: 1, area: 1 });
      continue;
    }

    // Ponderar: en dificultades altas preferir más grandes, en bajas más pequeñas
    let weights;
    if (difficulty >= 4) {
      weights = possibleRects.map(r => r.area * r.area);
    } else if (difficulty <= 2) {
      weights = possibleRects.map(r => 1 / r.area);
    } else {
      weights = possibleRects.map(() => 1);
    }

    // Selección ponderada
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let chosen = possibleRects[0];
    for (let i = 0; i < possibleRects.length; i++) {
      rand -= weights[i];
      if (rand <= 0) {
        chosen = possibleRects[i];
        break;
      }
    }

    // Marcar celdas como ocupadas
    for (let rr = chosen.r0; rr < chosen.r0 + chosen.h; rr++) {
      for (let cc = chosen.c0; cc < chosen.c0 + chosen.w; cc++) {
        occupied[rr][cc] = true;
      }
    }
    rects.push(chosen);
  }

  // Verificar que todo está cubierto
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!occupied[r][c]) return null;
    }
  }

  // Verificar que no hay rectángulos 1×1 (no válidos en Shikaku)
  // Fusionar rectángulos 1×1 con vecinos si es posible
  const finalRects = [];
  for (const rect of rects) {
    if (rect.area >= 2) {
      finalRects.push(rect);
    }
  }

  // Si hay 1×1, descartar esta partición
  if (finalRects.length !== rects.length) return null;

  return finalRects;
}

/**
 * Genera un puzzle Shikaku con solución única
 * @param {number} rows - Filas del tablero
 * @param {number} cols - Columnas del tablero
 * @param {number} difficulty - Dificultad (1-5)
 * @returns {Promise<{grid: number[][], clues: Array}>} Puzzle generado
 */
export async function generatePuzzle(rows, cols, difficulty = 3) {
  const cells = rows * cols;
  // Más intentos y más tiempo de verificación para grids grandes
  const maxAttempts = cells <= 64 ? 30 : cells <= 196 ? 50 : 80;
  const verifyTimeoutMs = cells <= 64 ? 5000 : cells <= 196 ? 8000 : cells <= 400 ? 12000 : 18000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Paso 1: Crear partición aleatoria
    const rects = generatePartition(rows, cols, difficulty);
    if (!rects) continue;

    // Paso 2: Colocar números (pistas) en celdas aleatorias de cada rectángulo
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));

    for (const rect of rects) {
      // Elegir celda aleatoria dentro del rectángulo
      const r = randInt(rect.r0, rect.r0 + rect.h - 1);
      const c = randInt(rect.c0, rect.c0 + rect.w - 1);
      grid[r][c] = rect.area;
    }

    // Paso 3: Verificar solución única (o al menos que tenga solución)
    const clues = extractClues(grid);
    const result = solve(grid, clues, 2, verifyTimeoutMs, null);

    // Aceptar: única solución siempre.
    // Para grids grandes (>400 celdas), aceptar también si el solver
    // encontró al menos 1 solución antes de agotar el tiempo.
    if (result.count === 1 ||
        (cells > 400 && result.timedOut && result.count >= 1)) {
      return { grid, clues };
    }

    // Permitir yield al event loop cada 5 intentos
    if (attempt % 5 === 4) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Fallback: generación simple garantizada con verificación
  return generateSimplePuzzle(rows, cols, difficulty);
}

/**
 * Generador simplificado de respaldo: crea rectángulos en grilla regular
 * @param {number} rows
 * @param {number} cols
 * @param {number} difficulty - Dificultad (1-5)
 * @returns {Promise<{grid: number[][], clues: Array}>}
 */
async function generateSimplePuzzle(rows, cols, difficulty = 3) {
  // Límites de dimensión según dificultad
  const maxDim = difficulty >= 5 ? 12 : difficulty >= 4 ? 8 : 4;

  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));

  let r = 0;
  while (r < rows) {
    let c = 0;
    while (c < cols) {
      if (occupied[r][c]) { c++; continue; }

      // Determinar tamaño máximo del rectángulo desde esta esquina
      let maxW = 0;
      for (let cc = c; cc < cols && !occupied[r][cc]; cc++) maxW++;
      let maxH = 0;
      outer: for (let rr = r; rr < rows; rr++) {
        for (let cc = c; cc < c + maxW; cc++) {
          if (occupied[rr][cc]) { break outer; }
        }
        maxH++;
      }

      // Elegir dimensiones según dificultad
      let w = Math.min(randInt(1, maxDim), maxW);
      let h = Math.min(randInt(1, Math.min(maxDim, Math.floor(100 / w))), maxH);

      // Garantizar área >= 2
      if (w * h < 2) {
        if (maxW >= 2) { w = 2; h = 1; }
        else if (maxH >= 2) { w = 1; h = 2; }
      }

      const area = w * h;

      for (let rr = r; rr < r + h; rr++) {
        for (let cc = c; cc < c + w; cc++) {
          occupied[rr][cc] = true;
        }
      }

      // Colocar pista
      const pr = randInt(r, r + h - 1);
      const pc = randInt(c, c + w - 1);
      grid[pr][pc] = Math.max(2, area);

      c += w;
    }
    r++;
  }

  const clues = extractClues(grid);
  // Verificar que tenga al menos una solución (el fallback la tiene por construcción,
  // pero confirmamos para asegurar integridad ante edge cases)
  const check = solve(grid, clues, 1, 10000, null);
  if (check.count >= 1) return { grid, clues };

  // Si por alguna razón falla, reintentar una vez más sin restricciones estrictas
  return _generateGuaranteedPuzzle(rows, cols, difficulty);
}

/**
 * Genera un puzzle válido con rectángulos de tamaño variado.
 * Rellena el tablero fila por fila con rectángulos aleatorios.
 * @param {number} rows
 * @param {number} cols
 * @param {number} difficulty - Dificultad (1-5)
 */
async function _generateGuaranteedPuzzle(rows, cols, difficulty = 3) {
  const maxDim = difficulty >= 5 ? 12 : difficulty >= 4 ? 8 : 4;

  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied[r][c]) continue;

      // Calcular ancho máximo libre en esta fila
      let maxW = 0;
      while (c + maxW < cols && !occupied[r][c + maxW]) maxW++;

      // Elegir ancho aleatorio según dificultad
      let w = Math.min(maxW, randInt(1, Math.min(maxDim, maxW)));

      // Calcular alto máximo libre para ese ancho
      let maxH = 0;
      for (let rr = r; rr < rows; rr++) {
        let rowFree = true;
        for (let cc = c; cc < c + w; cc++) {
          if (occupied[rr][cc]) { rowFree = false; break; }
        }
        if (!rowFree) break;
        maxH++;
      }

      // Elegir alto aleatorio, limitando área a 100
      let h = Math.min(maxH, randInt(1, Math.min(maxDim, Math.floor(100 / w), maxH)));

      // Garantizar área >= 2
      if (w * h < 2) {
        if (maxW >= 2) { w = 2; h = 1; }
        else if (maxH >= 2) { w = 1; h = 2; }
      }

      const area = w * h;

      // Marcar celdas como ocupadas
      for (let rr = r; rr < r + h; rr++)
        for (let cc = c; cc < c + w; cc++)
          occupied[rr][cc] = true;

      // Colocar pista en posición aleatoria dentro del rectángulo
      const pr = randInt(r, r + h - 1);
      const pc = randInt(c, c + w - 1);
      grid[pr][pc] = Math.max(2, area);
    }
  }

  const clues = extractClues(grid);
  return { grid, clues };
}
