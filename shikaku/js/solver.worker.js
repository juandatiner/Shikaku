/**
 * @file solver.worker.js
 * @description Web Worker que envuelve el solver DLX para ejecución en segundo plano.
 * Recibe mensajes SOLVE y CANCEL, envía PROGRESS y DONE.
 */

import { solve, extractClues } from './solver.js?v=13';

let cancelled = false;

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'CANCEL') {
    cancelled = true;
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

    try {
      const result = solve(grid, clueList, maxSolutions ?? Infinity, timeoutMs ?? 15000, onProgress);
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
