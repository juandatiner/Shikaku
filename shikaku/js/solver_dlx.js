/**
 * @file solver_dlx.js
 * @description DLX (Dancing Links / Algorithm X de Knuth) — SOLO PARA VERIFICACIÓN.
 *
 * Este solver no se usa para resolver puzzles en la app: el solver principal
 * es `solver_propio.js` (DP por fases). DLX vive aquí únicamente como
 * VERIFICADOR INDEPENDIENTE: cuenta soluciones con un algoritmo
 * estructuralmente distinto, y la app compara su conteo con el del solver
 * propio para detectar bugs (si los dos no coinciden, algo está mal).
 *
 * Formulación: cobertura exacta donde
 *   columnas 1..numClues          → una por pista
 *   columnas numClues+1..numClues+rows*cols → una por celda
 *   filas = candidatos (pista, rectángulo)
 */

import { getCandidates } from './solver_propio.js?v=4';

/**
 * Cuenta soluciones con DLX. Pensado como verificación cruzada del solver
 * principal — no se usa para resolver puzzles desde la UI.
 *
 * @param {number[][]} grid - Tablero (0=vacío, >0=pista)
 * @param {Array<{row,col,value}>} clues
 * @param {number} maxCount - Cortar al alcanzar este conteo
 * @param {number} timeoutMs
 * @returns {{count:number, timedOut:boolean, timeMs:number}}
 */
export function countSolutionsDLX(grid, clues, maxCount = Infinity, timeoutMs = 15000) {
  const t0 = performance.now();
  const rows = grid.length;
  const cols = grid[0].length;
  const numClues = clues.length;
  const numCells = rows * cols;

  if (numClues === 0) return { count: 0, timedOut: false, timeMs: 0 };

  let totalArea = 0;
  for (let i = 0; i < numClues; i++) totalArea += clues[i].value;
  if (totalArea !== numCells) return { count: 0, timedOut: false, timeMs: 0 };

  // Generar candidatos filtrados (no pueden contener otra pista)
  const cluePos = new Set();
  for (const cl of clues) cluePos.add(cl.row * cols + cl.col);

  const allCands = new Array(numClues);
  for (let ci = 0; ci < numClues; ci++) {
    const raw = getCandidates(clues[ci], rows, cols);
    const ownPos = clues[ci].row * cols + clues[ci].col;
    const filtered = [];
    for (const cand of raw) {
      let valid = true;
      for (let r = cand.r0; r < cand.r0 + cand.h && valid; r++)
        for (let c = cand.c0; c < cand.c0 + cand.w && valid; c++) {
          const pos = r * cols + c;
          if (pos !== ownPos && cluePos.has(pos)) valid = false;
        }
      if (valid) filtered.push(cand);
    }
    if (filtered.length === 0) return { count: 0, timedOut: false, timeMs: performance.now() - t0 };
    allCands[ci] = filtered;
  }

  // Construir estructura DLX con typed arrays
  const totalCols = numClues + numCells;
  let totalNodesEst = 1 + totalCols;
  for (let ci = 0; ci < numClues; ci++) {
    for (const cand of allCands[ci]) totalNodesEst += 1 + cand.w * cand.h;
  }

  const cap = totalNodesEst + 64;
  const L = new Int32Array(cap);
  const R = new Int32Array(cap);
  const U = new Int32Array(cap);
  const D = new Int32Array(cap);
  const COL = new Int32Array(cap);
  const S = new Int32Array(totalCols + 1);

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

  let nxt = totalCols + 1;

  function _addNode(col, firstOfRow) {
    const node = nxt++;
    COL[node] = col;
    U[node] = U[col];
    D[node] = col;
    D[U[col]] = node;
    U[col] = node;
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

  for (let ci = 0; ci < numClues; ci++) {
    for (const cand of allCands[ci]) {
      const firstNode = nxt;
      _addNode(ci + 1, firstNode);
      for (let r = cand.r0; r < cand.r0 + cand.h; r++) {
        for (let c = cand.c0; c < cand.c0 + cand.w; c++) {
          _addNode(numClues + r * cols + c + 1, firstNode);
        }
      }
    }
  }

  // Algorithm X
  let count = 0;
  let timedOut = false;
  let nodes = 0;
  const deadline = t0 + timeoutMs;

  function cover(c) {
    R[L[c]] = R[c]; L[R[c]] = L[c];
    for (let i = D[c]; i !== c; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        D[U[j]] = D[j]; U[D[j]] = U[j]; S[COL[j]]--;
      }
    }
  }
  function uncover(c) {
    for (let i = U[c]; i !== c; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        S[COL[j]]++; D[U[j]] = j; U[D[j]] = j;
      }
    }
    R[L[c]] = c; L[R[c]] = c;
  }

  function search() {
    if ((++nodes & 4095) === 0 && performance.now() > deadline) { timedOut = true; return; }
    if (R[0] === 0) { count++; return; }
    if (count >= maxCount) return;

    let minS = Infinity, bestC = -1;
    for (let j = R[0]; j !== 0; j = R[j]) {
      if (S[j] < minS) { minS = S[j]; bestC = j; }
    }
    if (minS === 0) return;

    cover(bestC);
    for (let r = D[bestC]; r !== bestC; r = D[r]) {
      for (let j = R[r]; j !== r; j = R[j]) cover(COL[j]);
      search();
      for (let j = L[r]; j !== r; j = L[j]) uncover(COL[j]);
      if (timedOut || count >= maxCount) break;
    }
    uncover(bestC);
  }

  search();

  return {
    count,
    timedOut,
    timeMs: Math.round((performance.now() - t0) * 1000) / 1000
  };
}
