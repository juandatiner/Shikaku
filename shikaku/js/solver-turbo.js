/**
 * @file solver-turbo.js
 * @description 🚀 Solver DLX TURBO para competición Shikaku.
 *
 * Optimizaciones vs solver.js estándar:
 *   1. Bitmap (Uint8Array) para posiciones de pistas → O(1) sin hash
 *   2. Candidatos filtrados inline durante generación (single-pass)
 *   3. Sin deduplicación de soluciones (solo necesitamos 1)
 *   4. Early exit al encontrar primera solución
 *   5. MRV optimizado con early-break en S=1
 *   6. Sin callbacks de progreso en hot path
 *   7. Cover/uncover con acceso directo a typed arrays
 *   8. Pre-allocación de todo en un solo bloque
 */

/**
 * Resuelve un puzzle Shikaku lo más rápido posible.
 * Solo busca UNA solución (la primera que encuentre).
 *
 * @param {number[][]} grid
 * @param {Array<{row:number,col:number,value:number}>} clues
 * @returns {{ solved: boolean, solution: Array|null, timeMs: number, nodesExplored: number }}
 */
export function solveTurbo(grid, clues) {
  const t0 = performance.now();
  const ROWS = grid.length;
  const COLS = grid[0].length;
  const numClues = clues.length;
  const numCells = ROWS * COLS;

  if (numClues === 0) return { solved: false, solution: null, timeMs: 0, nodesExplored: 0 };

  // ── Pre-check: suma de pistas == total celdas ──
  let totalArea = 0;
  for (let i = 0; i < numClues; i++) totalArea += clues[i].value;
  if (totalArea !== numCells) return { solved: false, solution: null, timeMs: performance.now() - t0, nodesExplored: 0 };

  // ── Bitmap de posiciones de pistas (TURBO: O(1) lookup sin hash) ──
  const clueMap = new Uint8Array(numCells);
  for (let i = 0; i < numClues; i++) {
    clueMap[clues[i].row * COLS + clues[i].col] = 1;
  }

  // ── Generar candidatos con filtrado integrado (single-pass) ──
  const allCands = new Array(numClues);
  let totalDLXRows = 0;

  for (let ci = 0; ci < numClues; ci++) {
    const clue = clues[ci];
    const val = clue.value;
    const cr = clue.row;
    const cc = clue.col;
    const ownPos = cr * COLS + cc;
    const cands = [];

    for (let w = 1; w <= val; w++) {
      if (val % w !== 0) continue;
      const h = val / w;
      const r0Min = cr - h + 1 < 0 ? 0 : cr - h + 1;
      const r0Max = ROWS - h < cr ? ROWS - h : cr;
      const c0Min = cc - w + 1 < 0 ? 0 : cc - w + 1;
      const c0Max = COLS - w < cc ? COLS - w : cc;

      if (r0Min > r0Max || c0Min > c0Max) continue;

      for (let r0 = r0Min; r0 <= r0Max; r0++) {
        candLoop:
        for (let c0 = c0Min; c0 <= c0Max; c0++) {
          for (let r = r0; r < r0 + h; r++) {
            const rowBase = r * COLS;
            for (let c = c0; c < c0 + w; c++) {
              if ((rowBase + c) !== ownPos && clueMap[rowBase + c]) continue candLoop;
            }
          }
          cands.push(r0, c0, w, h);
        }
      }
    }

    if (cands.length === 0) return { solved: false, solution: null, timeMs: performance.now() - t0, nodesExplored: 0 };
    allCands[ci] = cands;
    totalDLXRows += cands.length >> 2;
  }

  // ── Construir DLX con typed arrays ──
  const totalCols = numClues + numCells;

  let nodeEst = 1 + totalCols;
  for (let ci = 0; ci < numClues; ci++) {
    const c = allCands[ci];
    for (let k = 0; k < c.length; k += 4) {
      nodeEst += 1 + c[k + 2] * c[k + 3];
    }
  }

  const cap = nodeEst + 64;
  const L = new Int32Array(cap);
  const R = new Int32Array(cap);
  const U = new Int32Array(cap);
  const D = new Int32Array(cap);
  const COL = new Int32Array(cap);
  const RID = new Int32Array(cap);  // 🚀 Row ID directo en cada nodo
  const S = new Int32Array(totalCols + 1);

  // Root = 0, headers = 1..totalCols
  R[0] = 1;
  L[0] = totalCols;
  for (let j = 1; j <= totalCols; j++) {
    L[j] = j - 1;
    R[j] = j < totalCols ? j + 1 : 0;
    U[j] = j;
    D[j] = j;
    COL[j] = j;
  }

  let nxt = totalCols + 1;

  // Row mapping: dlxRow → (clueIdx, candOffset)
  const rmClue = new Int32Array(totalDLXRows);
  const rmOff = new Int32Array(totalDLXRows);
  let dlxRow = 0;

  for (let ci = 0; ci < numClues; ci++) {
    const cands = allCands[ci];
    for (let k = 0; k < cands.length; k += 4) {
      const r0 = cands[k], c0 = cands[k + 1], w = cands[k + 2], h = cands[k + 3];
      const first = nxt;

      // Nodo columna de pista
      const colP = ci + 1;
      COL[nxt] = colP;
      RID[nxt] = dlxRow;
      U[nxt] = U[colP]; D[nxt] = colP;
      D[U[colP]] = nxt; U[colP] = nxt;
      L[nxt] = nxt; R[nxt] = nxt;
      S[colP]++;
      nxt++;

      // Nodos columnas de celdas
      for (let r = r0; r < r0 + h; r++) {
        const rowBase = r * COLS;
        for (let c = c0; c < c0 + w; c++) {
          const colC = numClues + rowBase + c + 1;
          const node = nxt;
          COL[node] = colC;
          RID[node] = dlxRow;
          U[node] = U[colC]; D[node] = colC;
          D[U[colC]] = node; U[colC] = node;
          const prev = node - 1;
          L[node] = prev;
          R[node] = first;
          R[prev] = node;
          L[first] = node;
          S[colC]++;
          nxt++;
        }
      }

      rmClue[dlxRow] = ci;
      rmOff[dlxRow] = k;
      dlxRow++;
    }
  }

  // ── Algorithm X TURBO ──
  const partial = new Int32Array(numClues);
  let depth = 0;
  let solDepth = 0;
  let found = false;
  let nodesExplored = 0;

  function search() {
    nodesExplored++;

    if (R[0] === 0) { found = true; solDepth = depth; return; }

    // MRV con early-break en S==1
    let minS = 0x7FFFFFFF, bestC = -1;
    for (let j = R[0]; j !== 0; j = R[j]) {
      const s = S[j];
      if (s === 0) return;
      if (s < minS) { minS = s; bestC = j; if (s === 1) break; }
    }

    // Cover bestC
    R[L[bestC]] = R[bestC];
    L[R[bestC]] = L[bestC];
    for (let i = D[bestC]; i !== bestC; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        D[U[j]] = D[j]; U[D[j]] = U[j]; S[COL[j]]--;
      }
    }

    for (let r = D[bestC]; r !== bestC; r = D[r]) {
      partial[depth++] = r;

      for (let j = R[r]; j !== r; j = R[j]) {
        const col = COL[j];
        R[L[col]] = R[col]; L[R[col]] = L[col];
        for (let ii = D[col]; ii !== col; ii = D[ii]) {
          for (let jj = R[ii]; jj !== ii; jj = R[jj]) {
            D[U[jj]] = D[jj]; U[D[jj]] = U[jj]; S[COL[jj]]--;
          }
        }
      }

      search();
      depth--;
      if (found) return; // 🚀 EARLY EXIT

      for (let j = L[r]; j !== r; j = L[j]) {
        const col = COL[j];
        for (let ii = U[col]; ii !== col; ii = U[ii]) {
          for (let jj = L[ii]; jj !== ii; jj = L[jj]) {
            S[COL[jj]]++; D[U[jj]] = jj; U[D[jj]] = jj;
          }
        }
        R[L[col]] = col; L[R[col]] = col;
      }
    }

    // Uncover bestC
    for (let i = U[bestC]; i !== bestC; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        S[COL[j]]++; D[U[j]] = j; U[D[j]] = j;
      }
    }
    R[L[bestC]] = bestC; L[R[bestC]] = bestC;
  }

  search();
  const timeMs = performance.now() - t0;

  if (!found) {
    return { solved: false, solution: null, timeMs, nodesExplored };
  }

  // ── Mapear solución usando RID directo ──
  const solution = [];
  for (let i = 0; i < solDepth; i++) {
    const rid = RID[partial[i]];
    const ci = rmClue[rid];
    const off = rmOff[rid];
    const cands = allCands[ci];
    solution.push({
      clue: clues[ci],
      rect: { r0: cands[off], c0: cands[off + 1], w: cands[off + 2], h: cands[off + 3] }
    });
  }

  return { solved: true, solution, timeMs, nodesExplored };
}
