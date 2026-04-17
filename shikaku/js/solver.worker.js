/**
 * @file solver.worker.js
 * @description Web Worker que envuelve el solver DLX para ejecución en segundo plano.
 * Recibe mensajes SOLVE y CANCEL, envía PROGRESS y DONE.
 */

import { solve, extractClues, countSolutionsBT } from './solver.js?v=37';

let cancelled = false;

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'CANCEL') {
    cancelled = true;
    return;
  }

  if (msg.type === 'VERIFY_BT') {
    // Conteo cruzado con backtracking (verificación independiente).
    // Se ejecuta en un worker separado para NO bloquear el main thread
    // ni el autoplay del paso a paso.
    try {
      const { grid, clues, maxCount, timeoutMs } = msg;
      const clueList = clues || extractClues(grid);
      const result = countSolutionsBT(grid, clueList, maxCount ?? Infinity, timeoutMs ?? 15000);
      self.postMessage({ type: 'BT_DONE', result });
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
      if (cancelled) return true; // señal de cancelación
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
      const result = solve(grid, clueList, maxSolutions ?? Infinity, timeoutMs ?? 15000, onProgress, onSolution);
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
