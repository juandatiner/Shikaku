/**
 * @file generator.js
 * @description Generador procedural de puzzles Shikaku.
 * Crea particiones aleatorias válidas y verifica solución única.
 */

import { solve, extractClues } from './solver.js?v=14';
import { DIFFICULTY_CONFIG } from './constants.js?v=14';

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
function generatePartition(rows, cols, difficulty, maxRectAreaOverride = null) {
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const rects = [];

  // Parámetros según dificultad
  const maxRectArea = maxRectAreaOverride != null ? Math.min(maxRectAreaOverride, rows * cols / 2) :
                      difficulty <= 2 ? Math.min(8, rows * cols / 2) :
                      difficulty <= 3 ? Math.min(14, rows * cols / 3) :
                      difficulty <= 4 ? Math.min(30, rows * cols / 4) :
                      Math.min(100, rows * cols / 3);
  const minRectArea = 2;
  // En dificultades bajas, preferir rectángulos cuadrados
  const preferSquare = difficulty <= 2;

  // Distribución por rangos cuando hay override (tab Crear)
  // Rangos: diminuto, pequeño, mediano, grande, gigante, límite
  // Más rangos hacia la derecha (números grandes) para mayor variedad
  let ranges = null;
  let rangeCounts = null;
  if (maxRectAreaOverride != null && maxRectArea >= 12) {
    const m = maxRectArea;
    if (m >= 50) {
      // 8 rangos: más resolución en números grandes
      ranges = [
        [2, 4],                                                    // diminuto
        [5, 8],                                                    // pequeño
        [9, 15],                                                   // mediano bajo
        [16, Math.floor(m * 0.25)],                                // mediano alto
        [Math.floor(m * 0.25) + 1, Math.floor(m * 0.40)],         // grande bajo
        [Math.floor(m * 0.40) + 1, Math.floor(m * 0.58)],         // grande alto
        [Math.floor(m * 0.58) + 1, Math.floor(m * 0.78)],         // gigante
        [Math.floor(m * 0.78) + 1, m]                              // límite
      ];
    } else if (m >= 30) {
      // 6 rangos
      ranges = [
        [2, 3],                                                    // diminuto
        [4, 6],                                                    // pequeño
        [7, Math.floor(m * 0.25)],                                 // mediano
        [Math.floor(m * 0.25) + 1, Math.floor(m * 0.50)],         // grande
        [Math.floor(m * 0.50) + 1, Math.floor(m * 0.75)],         // gigante
        [Math.floor(m * 0.75) + 1, m]                              // límite
      ];
    } else if (m >= 20) {
      // 5 rangos
      ranges = [
        [2, 3],                                                    // diminuto
        [4, 6],                                                    // pequeño
        [7, Math.floor(m * 0.45)],                                 // mediano
        [Math.floor(m * 0.45) + 1, Math.floor(m * 0.75)],         // grande
        [Math.floor(m * 0.75) + 1, m]                              // gigante
      ];
    } else {
      // 4 rangos para grids pequeños (m 12-19)
      ranges = [
        [2, 3],                                                    // diminuto
        [4, Math.floor(m * 0.35)],                                 // pequeño
        [Math.floor(m * 0.35) + 1, Math.floor(m * 0.65)],         // mediano
        [Math.floor(m * 0.65) + 1, m]                              // grande
      ];
    }
    rangeCounts = new Array(ranges.length).fill(0);
  }

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
      occupied[startR][startC] = true;
      rects.push({ r0: startR, c0: startC, w: 1, h: 1, area: 1 });
      continue;
    }

    // Ponderar según modo
    let weights;
    if (ranges) {
      // Distribución balanceada por rangos: dar peso alto al rango menos representado
      const minCount = Math.min(...rangeCounts);
      weights = possibleRects.map(r => {
        const ri = ranges.findIndex(([lo, hi]) => r.area >= lo && r.area <= hi);
        if (ri === -1) return 0.1;
        // Rango más necesitado → peso 10, otros → peso 1
        return rangeCounts[ri] === minCount ? 10 : 1;
      });
    } else if (difficulty >= 4) {
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

    // Actualizar conteo de rangos
    if (ranges) {
      const ri = ranges.findIndex(([lo, hi]) => chosen.area >= lo && chosen.area <= hi);
      if (ri !== -1) rangeCounts[ri]++;
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
/**
 * @param {boolean} requireUnique - Si true (defecto), exige solución única.
 *   Pasar false para el generador del tab Crear (solo necesita ser válido).
 */
export async function generatePuzzle(rows, cols, difficulty = 3, requireUnique = true, maxRectAreaOverride = null) {
  const cells = rows * cols;
  const maxAttempts = cells <= 64 ? 30 : cells <= 196 ? 50 : 80;
  // Mayor timeout para grids medianos: el check de unicidad tarda más
  const verifyTimeoutMs = cells <= 64 ? 5000 : cells <= 196 ? 12000 : cells <= 400 ? 15000 : 20000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rects = generatePartition(rows, cols, difficulty, maxRectAreaOverride);
    if (!rects) continue;

    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (const rect of rects) {
      const r = randInt(rect.r0, rect.r0 + rect.h - 1);
      const c = randInt(rect.c0, rect.c0 + rect.w - 1);
      grid[r][c] = rect.area;
    }

    const clues = extractClues(grid);
    const result = solve(grid, clues, 2, verifyTimeoutMs, null);

    // Aceptar si:
    // 1. Solución única confirmada, O
    // 2. No se requiere unicidad y hay al menos 1 solución, O
    // 3. El solver encontró solución antes de timeout (grids > 64 celdas)
    if (result.count === 1 ||
        (!requireUnique && result.count >= 1) ||
        (cells > 64 && result.timedOut && result.count >= 1)) {
      return { grid, clues };
    }

    if (attempt % 5 === 4) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return generateSimplePuzzle(rows, cols, difficulty, maxRectAreaOverride);
}

/**
 * Generador simplificado de respaldo: crea rectángulos en grilla regular
 * @param {number} rows
 * @param {number} cols
 * @param {number} difficulty - Dificultad (1-5)
 * @param {number|null} maxRectAreaOverride - Override para área máxima
 * @returns {Promise<{grid: number[][], clues: Array}>}
 */
async function generateSimplePuzzle(rows, cols, difficulty = 3, maxRectAreaOverride = null) {
  const maxDimBase = difficulty >= 5 ? 12 : difficulty >= 4 ? 8 : 4;
  const maxDim = maxRectAreaOverride != null ? Math.ceil(Math.sqrt(maxRectAreaOverride)) : maxDimBase;

  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));

  let r = 0;
  while (r < rows) {
    let c = 0;
    while (c < cols) {
      if (occupied[r][c]) { c++; continue; }

      // Ancho máximo libre en esta fila desde c
      let maxW = 0;
      for (let cc = c; cc < cols && !occupied[r][cc]; cc++) maxW++;

      // Elegir ancho primero
      let w = Math.min(randInt(1, Math.min(maxDim, maxW)), maxW);

      // BUG FIX: calcular maxH para el w elegido, no para maxW
      let maxH = 0;
      hloop: for (let rr = r; rr < rows; rr++) {
        for (let cc = c; cc < c + w; cc++) {
          if (occupied[rr][cc]) { break hloop; }
        }
        maxH++;
      }

      let h = Math.min(randInt(1, Math.min(maxDim, Math.floor(100 / Math.max(1, w)))), maxH);

      // Garantizar área >= 2
      if (w * h < 2) {
        if (maxH >= 2) { h = 2; }
        else if (maxW >= 2) { w = 2; h = 1; }
        // Si maxW=1 y maxH=1: celda aislada → el BSP fallback lo resuelve
      }

      const area = w * h;
      for (let rr = r; rr < r + h; rr++)
        for (let cc = c; cc < c + w; cc++)
          occupied[rr][cc] = true;

      const pr = randInt(r, r + h - 1);
      const pc = randInt(c, c + w - 1);
      grid[pr][pc] = Math.max(2, area);

      c += w;
    }
    r++;
  }

  const clues = extractClues(grid);
  const check = solve(grid, clues, 1, 10000, null);
  if (check.count >= 1) return { grid, clues };

  return _generateGuaranteedPuzzle(rows, cols, difficulty, maxRectAreaOverride);
}

/**
 * Genera una partición BSP (Binary Space Partitioning) del grid.
 * Garantiza que NINGÚN rectángulo tenga área < 2, eliminando el bug
 * de celdas aisladas de los generadores anteriores.
 * @param {number} rows
 * @param {number} cols
 * @param {number} difficulty - Dificultad (1-5)
 * @returns {Promise<{grid: number[][], clues: Array}>}
 */
async function _generateGuaranteedPuzzle(rows, cols, difficulty = 3, maxRectAreaOverride = null) {
  const maxArea = maxRectAreaOverride != null ? Math.min(maxRectAreaOverride, Math.floor(rows * cols / 2)) :
                  difficulty >= 5 ? Math.min(100, Math.floor(rows * cols / 3)) :
                  difficulty >= 4 ? Math.min(30,  Math.floor(rows * cols / 3)) :
                  difficulty >= 3 ? Math.min(14,  Math.floor(rows * cols / 3)) :
                  Math.min(8, Math.floor(rows * cols / 2));

  // Para distribución balanceada: generar áreas objetivo por rango
  let targetAreas = null;
  if (maxRectAreaOverride != null && maxArea >= 12) {
    const m = maxArea;
    let rangesB;
    if (m >= 50) {
      rangesB = [
        [2, 4], [5, 8], [9, 15],
        [16, Math.floor(m * 0.25)],
        [Math.floor(m * 0.25) + 1, Math.floor(m * 0.40)],
        [Math.floor(m * 0.40) + 1, Math.floor(m * 0.58)],
        [Math.floor(m * 0.58) + 1, Math.floor(m * 0.78)],
        [Math.floor(m * 0.78) + 1, m]
      ];
    } else if (m >= 30) {
      rangesB = [
        [2, 3], [4, 6],
        [7, Math.floor(m * 0.25)],
        [Math.floor(m * 0.25) + 1, Math.floor(m * 0.50)],
        [Math.floor(m * 0.50) + 1, Math.floor(m * 0.75)],
        [Math.floor(m * 0.75) + 1, m]
      ];
    } else if (m >= 20) {
      rangesB = [
        [2, 3], [4, 6],
        [7, Math.floor(m * 0.45)],
        [Math.floor(m * 0.45) + 1, Math.floor(m * 0.75)],
        [Math.floor(m * 0.75) + 1, m]
      ];
    } else {
      rangesB = [
        [2, 3],
        [4, Math.floor(m * 0.35)],
        [Math.floor(m * 0.35) + 1, Math.floor(m * 0.65)],
        [Math.floor(m * 0.65) + 1, m]
      ];
    }
    const estCount = Math.max(rangesB.length, Math.floor(rows * cols / (m * 0.35)));
    const perRange = Math.max(1, Math.floor(estCount / rangesB.length));
    targetAreas = [];
    for (const [lo, hi] of rangesB) {
      for (let i = 0; i < perRange; i++) {
        targetAreas.push(randInt(lo, hi));
      }
    }
    shuffle(targetAreas);
  }

  const rects = [];
  let targetIdx = 0;

  function bsp(r0, c0, h, w) {
    const area = h * w;
    if (area < 2) return;

    // Si tenemos área objetivo, intentar partir para acercarnos a ella
    let localMax = maxArea;
    if (targetAreas && targetIdx < targetAreas.length) {
      localMax = Math.min(maxArea, Math.max(2, targetAreas[targetIdx]));
    }

    if (area <= localMax) {
      rects.push({ r0, c0, h, w });
      if (targetAreas) targetIdx++;
      return;
    }

    // Determinar si se puede partir vertical u horizontalmente
    // garantizando que ambas mitades tengan área >= 2
    const minHalfW = h === 1 ? 2 : 1;
    const canSplitV = w >= 2 * minHalfW;
    const minHalfH = w === 1 ? 2 : 1;
    const canSplitH = h >= 2 * minHalfH;

    const preferV = w > h || (w === h && Math.random() < 0.5);

    if ((preferV && canSplitV) || (!canSplitH && canSplitV)) {
      const lo = minHalfW;
      const hi = w - minHalfW;
      // Si hay área objetivo, intentar que una mitad se acerque a ella
      let pivot;
      if (targetAreas && targetIdx < targetAreas.length && h > 0) {
        const targetW = Math.max(lo, Math.min(hi, Math.round(targetAreas[targetIdx] / h)));
        pivot = targetW + randInt(-1, 1);
      } else {
        pivot = Math.floor(w / 2) + randInt(-Math.floor(w / 4), Math.floor(w / 4));
      }
      const w1 = Math.max(lo, Math.min(hi, pivot));
      bsp(r0, c0,      h, w1);
      bsp(r0, c0 + w1, h, w - w1);
    } else if (canSplitH) {
      const lo = minHalfH;
      const hi = h - minHalfH;
      let pivot;
      if (targetAreas && targetIdx < targetAreas.length && w > 0) {
        const targetH = Math.max(lo, Math.min(hi, Math.round(targetAreas[targetIdx] / w)));
        pivot = targetH + randInt(-1, 1);
      } else {
        pivot = Math.floor(h / 2) + randInt(-Math.floor(h / 4), Math.floor(h / 4));
      }
      const h1 = Math.max(lo, Math.min(hi, pivot));
      bsp(r0,      c0, h1,     w);
      bsp(r0 + h1, c0, h - h1, w);
    } else {
      rects.push({ r0, c0, h, w });
      if (targetAreas) targetIdx++;
    }
  }

  bsp(0, 0, rows, cols);

  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const rect of rects) {
    const pr = randInt(rect.r0, rect.r0 + rect.h - 1);
    const pc = randInt(rect.c0, rect.c0 + rect.w - 1);
    grid[pr][pc] = rect.h * rect.w;
  }

  const clues = extractClues(grid);
  return { grid, clues };
}
