/**
 * @file main.js
 * @description Punto de entrada de la aplicación Shikaku.
 * Importa todos los módulos y arranca la UI.
 */

import { initUI } from './ui.js?v=31';

// Iniciar la aplicación cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}
