/**
 * @file solver.js
 * @description Solver DLX (Dancing Links / Algorithm X de Knuth) para Shikaku.
 *
 * Shikaku es un problema de cobertura exacta:
 *   - Cubrir todas las celdas del tablero exactamente una vez con rectángulos.
 *   - Cada pista se asigna a exactamente un rectángulo cuya área = valor de la pista.
 *
 * Formulación de la matriz DLX:
 *   Columnas 1..numClues         → una por pista (asignación única)
 *   Columnas numClues+1..numClues+rows*cols → una por celda (cobertura única)
 *
 *   Cada fila = un candidato (pista i, rectángulo k)
 *   → cubre: columna pista_i + columnas de todas las celdas del rectángulo
 *
 * DLX resuelve esto de forma óptima:
 *   - MRV automático (columna con menos filas)
 *   - Cover/uncover O(1) con listas doblemente enlazadas
 *   - Poda implícita de candidatos conflictivos
 *
 * Implementación con arrays paralelos (Int32Array) para máximo rendimiento en JS.
 */

// ═══════════════════════════════════════════════════════
// FUNCIONES UTILITARIAS (API pública)
// ═══════════════════════════════════════════════════════

/**
 * Obtiene todas las factorizaciones de un número
 * @param {number} n
 * @returns {Array<[number, number]>} Pares [ancho, alto]
 */
export function getFactorizations(n) {
  const result = [];
  for (let w = 1; w <= n; w++) {
    if (n % w === 0) result.push([w, n / w]);
  }
  return result;
}

/**
 * Genera todos los rectángulos candidatos para una pista.
 * Cada candidato es un rectángulo que contiene la celda de la pista
 * y cuya área = valor de la pista.
 * @param {{row:number, col:number, value:number}} clue
 * @param {number} rows - Filas del tablero
 * @param {number} cols - Columnas del tablero
 * @returns {Array<{r0:number, c0:number, w:number, h:number}>}
 */
export function getCandidates(clue, rows, cols) {
  const candidates = [];
  for (const [w, h] of getFactorizations(clue.value)) {
    const r0Min = Math.max(0, clue.row - h + 1);
    const r0Max = Math.min(rows - h, clue.row);
    const c0Min = Math.max(0, clue.col - w + 1);
    const c0Max = Math.min(cols - w, clue.col);
    for (let r0 = r0Min; r0 <= r0Max; r0++) {
      for (let c0 = c0Min; c0 <= c0Max; c0++) {
        candidates.push({ r0, c0, w, h });
      }
    }
  }
  return candidates;
}

/**
 * Extrae las pistas de una grilla
 * @param {number[][]} grid
 * @returns {Array<{row:number, col:number, value:number}>}
 */
export function extractClues(grid) {
  const clues = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[0].length; c++)
      if (grid[r][c] > 0) clues.push({ row: r, col: c, value: grid[r][c] });
  return clues;
}

// ═══════════════════════════════════════════════════════
// SOLVER DLX
// ═══════════════════════════════════════════════════════

/**
 * Resuelve un puzzle Shikaku usando Algorithm X con Dancing Links.
 *
 * @param {number[][]} grid - Grilla (0=vacío, >0=pista)
 * @param {Array<{row:number,col:number,value:number}>} clues
 * @param {number} maxSolutions - Detenerse al encontrar N soluciones
 * @param {number} timeoutMs - Timeout en milisegundos
 * @param {Function|null} onProgress - Callback(nodesExplored, timeMs) → truthy para cancelar
 * @returns {{solutions: Array, count: number, timedOut: boolean, stats: Object}}
 */
export function solve(grid, clues, maxSolutions = Infinity, timeoutMs = 15000, onProgress = null) {
  const t0 = performance.now();
  const rows = grid.length;
  const cols = grid[0].length;
  const numClues = clues.length;
  const numCells = rows * cols;

  if (numClues === 0) return _result([], 0, false, t0, 0);

  // ── Pre-check: la suma de valores debe cubrir todo el tablero ──
  let totalArea = 0;
  for (let i = 0; i < numClues; i++) totalArea += clues[i].value;
  if (totalArea !== numCells) return _result([], 0, false, t0, 0);

  // ── Generar candidatos y filtrar estáticamente ──
  // Set de posiciones de pistas para filtrado rápido
  const clueAt = new Set();
  for (const cl of clues) clueAt.add(cl.row * cols + cl.col);

  const allCands = new Array(numClues);
  let totalRows = 0;

  for (let ci = 0; ci < numClues; ci++) {
    const raw = getCandidates(clues[ci], rows, cols);
    const ownPos = clues[ci].row * cols + clues[ci].col;

    // Filtrar: un rectángulo no puede contener otra pista
    const filtered = [];
    for (let k = 0; k < raw.length; k++) {
      const cand = raw[k];
      let valid = true;
      for (let r = cand.r0; r < cand.r0 + cand.h; r++) {
        for (let c = cand.c0; c < cand.c0 + cand.w; c++) {
          const pos = r * cols + c;
          if (pos !== ownPos && clueAt.has(pos)) { valid = false; break; }
        }
        if (!valid) break;
      }
      if (valid) filtered.push(cand);
    }

    if (filtered.length === 0) return _result([], 0, false, t0, 0);
    allCands[ci] = filtered;
    totalRows += filtered.length;
  }

  // ── Construir estructura DLX ──
  const totalCols = numClues + numCells; // columnas DLX
  // Nodos: root(1) + headers(totalCols) + data
  let totalNodesEst = 1 + totalCols;
  for (let ci = 0; ci < numClues; ci++) {
    for (const cand of allCands[ci]) {
      totalNodesEst += 1 + cand.w * cand.h; // 1 clue col + cells
    }
  }

  const cap = totalNodesEst + 64;
  const L = new Int32Array(cap);
  const R = new Int32Array(cap);
  const U = new Int32Array(cap);
  const D = new Int32Array(cap);
  const COL = new Int32Array(cap);   // columna header de cada nodo
  const S = new Int32Array(totalCols + 1); // tamaño de cada columna
  const RID = new Int32Array(cap);   // row ID de cada nodo

  // root = nodo 0, headers = nodos 1..totalCols
  R[0] = 1;
  L[0] = totalCols;
  for (let j = 1; j <= totalCols; j++) {
    L[j] = j - 1;
    R[j] = j < totalCols ? j + 1 : 0;
    U[j] = j;
    D[j] = j;
    COL[j] = j;
    S[j] = 0;
  }

  let nxt = totalCols + 1; // próximo nodo libre

  // Mapa: dlxRowIdx → { clueIdx, candIdx }
  const rowMap = [];
  let dlxRow = 0;

  for (let ci = 0; ci < numClues; ci++) {
    const cands = allCands[ci];
    for (let ki = 0; ki < cands.length; ki++) {
      const cand = cands[ki];
      const firstNode = nxt;

      // Columna de pista
      _addNode(ci + 1, dlxRow, firstNode);

      // Columnas de celdas
      for (let r = cand.r0; r < cand.r0 + cand.h; r++) {
        for (let c = cand.c0; c < cand.c0 + cand.w; c++) {
          _addNode(numClues + r * cols + c + 1, dlxRow, firstNode);
        }
      }

      rowMap.push({ clueIdx: ci, candIdx: ki });
      dlxRow++;
    }
  }

  function _addNode(col, rowId, firstOfRow) {
    const node = nxt++;
    COL[node] = col;
    RID[node] = rowId;

    // Enlace vertical: insertar encima del header
    U[node] = U[col];
    D[node] = col;
    D[U[col]] = node;
    U[col] = node;

    // Enlace horizontal: circular dentro de la fila
    if (node === firstOfRow) {
      L[node] = node;
      R[node] = node;
    } else {
      const prev = node - 1;
      L[node] = prev;
      R[node] = firstOfRow;
      R[prev] = node;
      L[firstOfRow] = node;
    }

    S[col]++;
  }

  // ── Algorithm X ──
  //
  // maxSolutions controla cuándo PARAR de buscar:
  //   - El generador usa 2 para verificar unicidad rápido.
  //   - Verificar/Resolver usan un número grande → el timeout los frena.
  //
  // Para no llenar la memoria, solo almacenamos las primeras MAX_STORED
  // soluciones. El contador sigue hasta maxSolutions o timeout.

  const MAX_STORED = 10;
  const stored = [];    // soluciones almacenadas (máximo MAX_STORED)
  let totalCount = 0;   // contador real sin límite (hasta maxSolutions)
  const partial = [];
  let timedOut = false;
  let nodesExplored = 0;
  const deadline = t0 + timeoutMs;

  function cover(c) {
    R[L[c]] = R[c];
    L[R[c]] = L[c];
    for (let i = D[c]; i !== c; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        D[U[j]] = D[j];
        U[D[j]] = U[j];
        S[COL[j]]--;
      }
    }
  }

  function uncover(c) {
    for (let i = U[c]; i !== c; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        S[COL[j]]++;
        D[U[j]] = j;
        U[D[j]] = j;
      }
    }
    R[L[c]] = c;
    L[R[c]] = c;
  }

  function search() {
    // Timeout check cada 4096 nodos
    if ((++nodesExplored & 4095) === 0) {
      if (performance.now() > deadline) { timedOut = true; return; }
      // Progress callback cada ~65536 nodos
      if (onProgress && (nodesExplored & 0xFFFF) === 0) {
        const cancel = onProgress(nodesExplored, performance.now() - t0);
        if (cancel) { timedOut = true; return; }
      }
    }

    // ¿Todas las columnas cubiertas? → solución encontrada
    if (R[0] === 0) {
      totalCount++;
      if (stored.length < MAX_STORED) {
        stored.push(partial.slice());
      }
      return;
    }

    // ¿Ya alcanzamos el límite de conteo?
    if (totalCount >= maxSolutions) return;

    // Seleccionar columna con mínimo S (MRV heuristic)
    let minS = Infinity, bestC = -1;
    for (let j = R[0]; j !== 0; j = R[j]) {
      if (S[j] < minS) { minS = S[j]; bestC = j; }
    }

    if (minS === 0) return; // dead end

    cover(bestC);

    for (let r = D[bestC]; r !== bestC; r = D[r]) {
      partial.push(RID[r]);

      for (let j = R[r]; j !== r; j = R[j]) cover(COL[j]);

      search();

      for (let j = L[r]; j !== r; j = L[j]) uncover(COL[j]);

      partial.pop();

      if (timedOut || totalCount >= maxSolutions) break;
    }

    uncover(bestC);
  }

  search();

  // ── Mapear soluciones almacenadas al formato esperado ──
  const mappedSolutions = stored.map(rowIndices =>
    rowIndices.map(ri => {
      const { clueIdx, candIdx } = rowMap[ri];
      return {
        clue: { ...clues[clueIdx] },
        rect: { ...allCands[clueIdx][candIdx] }
      };
    })
  );

  return _result(mappedSolutions, totalCount, timedOut, t0, nodesExplored);
}

// ═══════════════════════════════════════════════════════
// VERIFICADOR INDEPENDIENTE
// ═══════════════════════════════════════════════════════

/**
 * Valida que una solución DLX sea correcta:
 *  - Cada celda cubierta exactamente una vez
 *  - Cada pista dentro de exactamente un rectángulo
 *  - Cada rectángulo tiene área = valor de su pista
 */
export function validateSolution(grid, solution) {
  const rows = grid.length;
  const cols = grid[0].length;
  const coverage = new Uint8Array(rows * cols);

  for (let i = 0; i < solution.length; i++) {
    const { clue, rect } = solution[i];
    if (rect.w * rect.h !== clue.value)
      return { valid: false, error: `Rect ${i}: area ${rect.w*rect.h} != pista ${clue.value}` };
    if (clue.row < rect.r0 || clue.row >= rect.r0 + rect.h ||
        clue.col < rect.c0 || clue.col >= rect.c0 + rect.w)
      return { valid: false, error: `Rect ${i}: pista fuera del rect` };
    if (rect.r0 < 0 || rect.c0 < 0 || rect.r0 + rect.h > rows || rect.c0 + rect.w > cols)
      return { valid: false, error: `Rect ${i}: fuera del tablero` };
    for (let r = rect.r0; r < rect.r0 + rect.h; r++)
      for (let c = rect.c0; c < rect.c0 + rect.w; c++) {
        const pos = r * cols + c;
        if (coverage[pos]) return { valid: false, error: `Celda (${r},${c}) doble cobertura` };
        coverage[pos] = 1;
      }
  }
  for (let i = 0; i < rows * cols; i++)
    if (!coverage[i]) return { valid: false, error: `Celda sin cubrir` };
  return { valid: true };
}

/**
 * Cuenta soluciones usando backtracking con MRV dinámico.
 * Algoritmo independiente de DLX para verificación cruzada.
 * Usa MRV dinámico (elige pista con menos candidatos viables en cada paso)
 * y pre-computa celdas por candidato para acceso rápido.
 */
export function countSolutionsBT(grid, clues, maxCount = Infinity, timeoutMs = 15000) {
  const t0 = performance.now();
  const rows = grid.length;
  const cols = grid[0].length;
  const numClues = clues.length;

  if (numClues === 0) return { count: 0, timedOut: false, timeMs: 0 };

  let totalArea = 0;
  for (let i = 0; i < numClues; i++) totalArea += clues[i].value;
  if (totalArea !== rows * cols) return { count: 0, timedOut: false, timeMs: 0 };

  const cluePositions = new Set();
  for (const cl of clues) cluePositions.add(cl.row * cols + cl.col);

  // Pre-computar candidatos con arrays de celdas
  const candsByClue = new Array(numClues);
  for (let ci = 0; ci < numClues; ci++) {
    const raw = getCandidates(clues[ci], rows, cols);
    const ownPos = clues[ci].row * cols + clues[ci].col;
    const filtered = [];
    for (const cand of raw) {
      let valid = true;
      const cells = [];
      for (let r = cand.r0; r < cand.r0 + cand.h && valid; r++)
        for (let c = cand.c0; c < cand.c0 + cand.w && valid; c++) {
          const pos = r * cols + c;
          if (pos !== ownPos && cluePositions.has(pos)) valid = false;
          else cells.push(pos);
        }
      if (valid) filtered.push(cells);
    }
    if (filtered.length === 0) return { count: 0, timedOut: false, timeMs: performance.now() - t0 };
    candsByClue[ci] = filtered;
  }

  const used = new Uint8Array(rows * cols);
  const assigned = new Uint8Array(numClues);
  const deadline = t0 + timeoutMs;
  let count = 0;
  let timedOut = false;
  let nodes = 0;

  function bt(depth) {
    if (timedOut || count >= maxCount) return;
    if ((++nodes & 4095) === 0 && performance.now() > deadline) { timedOut = true; return; }
    if (depth === numClues) { count++; return; }

    // MRV dinámico: pista no asignada con menos candidatos viables
    let bestCi = -1, bestViable = Infinity;
    for (let ci = 0; ci < numClues; ci++) {
      if (assigned[ci]) continue;
      let viable = 0;
      const cands = candsByClue[ci];
      for (let k = 0; k < cands.length; k++) {
        const cells = cands[k];
        let ok = true;
        for (let j = 0; j < cells.length; j++) {
          if (used[cells[j]]) { ok = false; break; }
        }
        if (ok) viable++;
      }
      if (viable === 0) return; // dead end
      if (viable < bestViable) { bestViable = viable; bestCi = ci; }
    }

    assigned[bestCi] = 1;
    const cands = candsByClue[bestCi];

    for (let k = 0; k < cands.length; k++) {
      const cells = cands[k];
      let canPlace = true;
      for (let j = 0; j < cells.length; j++) {
        if (used[cells[j]]) { canPlace = false; break; }
      }
      if (!canPlace) continue;

      for (let j = 0; j < cells.length; j++) used[cells[j]] = 1;
      bt(depth + 1);
      for (let j = 0; j < cells.length; j++) used[cells[j]] = 0;

      if (timedOut || count >= maxCount) return;
    }

    assigned[bestCi] = 0;
  }

  bt(0);

  return {
    count,
    timedOut,
    timeMs: Math.round((performance.now() - t0) * 1000) / 1000
  };
}

/**
 * Construye el objeto resultado con estadísticas.
 */
function _result(solutions, count, timedOut, t0, nodesExplored) {
  return {
    solutions,
    count,
    timedOut,
    stats: {
      timeMs: Math.round((performance.now() - t0) * 1000) / 1000,
      nodesExplored,
      backtracks: 0,
      prunedBranches: 0,
      clueOrder: [],
      perClue: []
    }
  };
}
