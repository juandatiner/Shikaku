/**
 * @file solver.worker.js
 * @description Web Worker que envuelve el solver propio (DP + cascada)
 * para ejecución en segundo plano.
 * Recibe mensajes SOLVE y CANCEL, envía PROGRESS y DONE.
 */

import { solvePropio, extractClues } from './solver_propio.js?v=5';
import { countSolutionsDLX } from './solver_dlx.js?v=1';

let cancelled = false;

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'CANCEL') {
    cancelled = true;
    return;
  }

  if (msg.type === 'VERIFY_DLX') {
    // Conteo cruzado con DLX (verificación independiente del solver propio).
    try {
      const { grid, clues, maxCount, timeoutMs } = msg;
      const clueList = clues || extractClues(grid);
      const result = countSolutionsDLX(grid, clueList, maxCount ?? Infinity, timeoutMs ?? 15000);
      self.postMessage({ type: 'DLX_DONE', result });
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message });
    }
    return;
  }

  if (msg.type === 'SOLVE') {
    cancelled = false;
    const { grid, clues, maxSolutions, timeoutMs } = msg;
    const clueList = clues || extractClues(grid);

    const onProgress = (nodesExplored, timeMs) => {
      if (cancelled) return true;
      self.postMessage({
        type: 'PROGRESS',
        nodesExplored,
        timeMs: Math.round(timeMs * 100) / 100
      });
      return false;
    };

    const onSolution = (solution, count) => {
      if (cancelled) return;
      self.postMessage({
        type: 'SOLUTION_FOUND',
        solution,
        count
      });
    };

    try {
      const result = solvePropio(grid, clueList, maxSolutions ?? Infinity, timeoutMs ?? 15000, onProgress, onSolution);
      if (cancelled) {
        self.postMessage({ type: 'CANCELLED' });
      } else {
        self.postMessage({ type: 'DONE', result });
      }
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message });
    }
  }
};
