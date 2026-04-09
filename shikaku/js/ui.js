/**
 * @file ui.js
 * @description Navegación entre pantallas, eventos globales, tabs y lógica de UI.
 */

import { DIFFICULTY_CONFIG, LEVELS_PER_DIFFICULTY, ICONS, SOLVER_CONFIG } from './constants.js?v=13';
import { Board } from './board.js?v=13';
import { getSizeForLevel, generatePuzzle } from './generator.js?v=13';
import { solve, extractClues, getCandidates, countSolutionsBT, validateSolution } from './solver.js?v=13';

/** Estado global de la aplicación */
const state = {
  currentScreen: 'home',
  currentTab: 'play',
  activeBoard: null,
  activeDifficulty: null,
  activeLevel: null,
  timer: null,
  timerSeconds: 0,
  solverWorker: null,
  verifyWorker: null,
  solverResult: null,
  solutionIndex: 0,
  currentStep: 0,
  autoPlaying: false,
  autoPlayInterval: null,
  gameInProgress: false,
  currentGrid: null,
  currentClues: null,
  hintsUsed: 0,
  isCustomMap: false,
  activeCustomMapId: null,
};

// ══════════════════════════════════════════════════════════
// PERSISTENCIA DE NIVELES Y PUZZLES
// ══════════════════════════════════════════════════════════

function _getCompletedLevels() {
  try {
    return new Set(JSON.parse(localStorage.getItem('shikaku_completed') || '[]'));
  } catch { return new Set(); }
}

function _markLevelCompleted(difficulty, level) {
  const completed = _getCompletedLevels();
  completed.add(`${difficulty}-${level}`);
  try { localStorage.setItem('shikaku_completed', JSON.stringify([...completed])); }
  catch { }
}

function _getStarsMap() {
  try { return JSON.parse(localStorage.getItem('shikaku_stars') || '{}'); }
  catch { return {}; }
}

function _saveStars(difficulty, level, stars) {
  const map = _getStarsMap();
  map[`${difficulty}-${level}`] = stars;
  try { localStorage.setItem('shikaku_stars', JSON.stringify(map)); }
  catch { }
}

function _getCustomMaps() {
  try { return JSON.parse(localStorage.getItem('shikaku_custom_maps') || '[]'); }
  catch { return []; }
}

function _saveCustomMap(grid, name, type = 'created') {
  const maps = _getCustomMaps();
  const id = Date.now();
  const clues = extractClues(grid);
  const rows = grid.length;
  const cols = grid[0].length;
  const defaultName = `${cols}×${rows} · ${clues.length}📍`;
  maps.push({
    id,
    name: name || defaultName,
    grid,
    clues: clues.length,
    size: `${rows}×${cols}`,
    type: type,
    date: new Date().toISOString()
  });
  try { localStorage.setItem('shikaku_custom_maps', JSON.stringify(maps)); }
  catch { }
  return id;
}

function _deleteCustomMap(id) {
  let maps = _getCustomMaps();
  maps = maps.filter(m => m.id !== id);
  try { localStorage.setItem('shikaku_custom_maps', JSON.stringify(maps)); }
  catch { }
}

function _saveCustomMapStars(id, stars) {
  const maps = _getCustomMaps();
  const map = maps.find(m => m.id === id);
  if (map) {
    map.stars = stars;
    try { localStorage.setItem('shikaku_custom_maps', JSON.stringify(maps)); }
    catch { }
  }
}

function _showConfirm(message, onConfirm) {
  let overlay = document.getElementById('app-confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'app-confirm-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content confirm-modal app-confirm-modal">
        <p id="app-confirm-msg"></p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="app-confirm-cancel">Cancelar</button>
          <button class="btn btn-danger" id="app-confirm-ok">Eliminar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('app-confirm-msg').textContent = message;
  overlay.style.display = 'flex';
  const close = () => { overlay.style.display = 'none'; };
  document.getElementById('app-confirm-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.getElementById('app-confirm-ok').onclick = () => { close(); onConfirm(); };
}

function _findDuplicateMap(grid) {
  const maps = _getCustomMaps();
  for (const map of maps) {
    if (JSON.stringify(grid) === JSON.stringify(map.grid)) {
      return map;
    }
  }
  return null;
}

function _getStars(difficulty, level) {
  return _getStarsMap()[`${difficulty}-${level}`] ?? null;
}

/**
 * Calcula estrellas basado en pistas usadas vs total de pistas.
 * Thresholds varían por dificultad: más estrictos para fáciles, más generosos para difíciles.
 * 3 = sin pistas, 2 = pocas pistas, 1 = moderadas, 0 = muchas pistas.
 */
function _calcStars(hintsUsed, totalClues, difficulty) {
  if (hintsUsed === 0) return 3;
  const ratio = hintsUsed / totalClues;

  // Thresholds por dificultad
  const thresholds = {
    'Principiante': { twoStars: 0.15, oneStar: 0.35 },
    'Fácil': { twoStars: 0.15, oneStar: 0.35 },
    'Medio': { twoStars: 0.25, oneStar: 0.50 },
    'Difícil': { twoStars: 0.35, oneStar: 0.60 },
    'Experto': { twoStars: 0.40, oneStar: 0.70 }
  };

  const config = thresholds[difficulty] || { twoStars: 0.2, oneStar: 0.5 };

  if (ratio > config.oneStar) return 0;
  if (ratio <= config.twoStars) return 2;
  return 1;
}

function _renderStarsHTML(earned, size = 20) {
  let html = '';
  for (let i = 0; i < 3; i++) {
    const filled = i < earned;
    html += `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${filled ? '#f5a623' : 'none'}" stroke="${filled ? '#f5a623' : '#ccc'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`;
  }
  return html;
}

/** Guarda un puzzle generado en localStorage */
function _savePuzzle(difficulty, level, grid) {
  const key = `shikaku_puzzle_d${difficulty}_l${level}`;
  try { localStorage.setItem(key, JSON.stringify(grid)); }
  catch { }
}

/** Carga un puzzle guardado */
function _loadPuzzle(difficulty, level) {
  try {
    const data = localStorage.getItem(`shikaku_puzzle_d${difficulty}_l${level}`);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

/** Obtiene todos los puzzles guardados */
function _getAllSavedPuzzles() {
  const puzzles = [];
  for (let d = 1; d <= 5; d++) {
    for (let l = 1; l <= LEVELS_PER_DIFFICULTY; l++) {
      const grid = _loadPuzzle(d, l);
      if (grid) {
        const config = DIFFICULTY_CONFIG[d - 1];
        puzzles.push({ difficulty: d, level: l, grid, name: config.name });
      }
    }
  }
  return puzzles;
}

/**
 * Convierte una grilla al formato .txt nuevo:
 * ANCHO ALTO
 * CANTIDAD_DE_PISTAS
 * FILA COLUMNA VALOR
 * ...
 */
function _gridToTxt(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const clues = extractClues(grid);
  let txt = `${cols} ${rows}\n`;
  txt += `${clues.length}\n`;
  for (const cl of clues) {
    txt += `${cl.row} ${cl.col} ${cl.value}\n`;
  }
  return txt;
}

/** Descarga un archivo de texto */
function _downloadTxt(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════

export function initUI() {
  _renderHomeScreen();
  _bindTabEvents();
  _showTab('play');
  // Limpiar puzzles potencialmente inválidos de versiones anteriores
  _purgeUnverifiedPuzzles();
}

/**
 * Purga puzzles guardados que pueden ser inválidos (generados por fallback sin verificación).
 * Usa un flag de versión para hacerlo solo una vez por versión del código.
 */
function _purgeUnverifiedPuzzles() {
  const VERIFIED_VERSION = 'v2'; // incrementar si cambia el generador
  const flagKey = 'shikaku_puzzles_verified';
  if (localStorage.getItem(flagKey) === VERIFIED_VERSION) return;

  // Purgar todos los puzzles guardados de dificultad 4 y 5 (Difícil/Experto)
  // Son los más propensos a ser de fallback o tener timeout en el solver.
  // Se regenerarán automáticamente al entrar al nivel.
  for (let l = 1; l <= LEVELS_PER_DIFFICULTY; l++) {
    localStorage.removeItem(`shikaku_puzzle_d4_l${l}`);
    localStorage.removeItem(`shikaku_puzzle_d5_l${l}`);
  }

  // Para niveles 1-3 (Principiante/Fácil/Medio), verificar rápido en background
  _verifySmallPuzzlesInBackground();

  localStorage.setItem(flagKey, VERIFIED_VERSION);
}

/**
 * Verifica puzzles de dificultades 1-3 en background.
 * Los que no tengan solución en 3 segundos se purgan para regeneración.
 */
async function _verifySmallPuzzlesInBackground() {
  await new Promise(r => setTimeout(r, 500)); // esperar que la UI esté lista
  for (let d = 1; d <= 3; d++) {
    for (let l = 1; l <= LEVELS_PER_DIFFICULTY; l++) {
      const grid = _loadPuzzle(d, l);
      if (!grid) continue;
      try {
        const clues = extractClues(grid);
        const result = solve(grid, clues, 1, 3000);
        if (result.count === 0 && !result.timedOut) {
          // No tiene solución → eliminar
          localStorage.removeItem(`shikaku_puzzle_d${d}_l${l}`);
        }
      } catch { /* ignorar */ }
      // Yield para no bloquear la UI
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

// ══════════════════════════════════════════════════════════
// PANTALLA DE INICIO
// ══════════════════════════════════════════════════════════

function _renderHomeScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="screen-home" class="screen active">
      <div class="home-header">
        <div class="home-logo">
          ${ICONS.PUZZLE}
          <h1>Shikaku</h1>
        </div>
        <p class="home-subtitle">El rompecabezas de los rectángulos</p>
      </div>
      <div class="home-content">
        <div id="tab-play" class="tab-content active">
          ${_renderPlayTab()}
        </div>
        <div id="tab-create" class="tab-content">
          ${_renderCreateTab()}
        </div>
        <div id="tab-upload" class="tab-content">
          ${_renderUploadTab()}
        </div>
        <div id="tab-export" class="tab-content">
          ${_renderExportTab()}
        </div>
      </div>
      <nav class="bottom-nav">
        <button class="nav-tab active" data-tab="play">
          ${ICONS.PUZZLE}
          <span>Jugar</span>
        </button>
        <button class="nav-tab" data-tab="create">
          ${ICONS.PENCIL}
          <span>Crear</span>
        </button>
        <button class="nav-tab" data-tab="upload">
          ${ICONS.UPLOAD}
          <span>Subir</span>
        </button>
        <button class="nav-tab" data-tab="export">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="M15 15l-3 3-3-3"/></svg>
          <span>Exportar</span>
        </button>
      </nav>
      <div id="library-modal" class="modal-overlay" style="display:none">
        <div class="modal-content" style="max-height: 80vh; width: 90%; max-width: 600px; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h2 id="library-title">🗺️ Mis mapas creados</h2>
            <button class="btn btn-secondary btn-sm" id="library-close" style="padding: 4px 8px;">✕</button>
          </div>
          <div id="library-content"></div>
        </div>
      </div>
    </div>
    <div id="screen-game" class="screen"></div>
  `;

  _bindPlayEvents();
  _bindCreateEvents();
  _bindUploadEvents();
  _bindExportEvents();
  _bindLibraryEvents();
}

function _renderPlayTab() {
  const completed = _getCompletedLevels();
  const starsMap = _getStarsMap();
  return `
    <div class="difficulty-list">
      ${DIFFICULTY_CONFIG.map(d => `
        <div class="difficulty-group" data-diff="${d.id}">
          <button class="difficulty-btn" style="background:${d.color};color:${d.textColor}">
            <span class="diff-name">${d.name}</span>
            <span class="diff-range">${d.minR}×${d.minR} — ${d.maxR}×${d.maxR}</span>
          </button>
          <div class="level-panel" id="levels-${d.id}">
            <div class="level-grid">
              ${Array.from({length: LEVELS_PER_DIFFICULTY}, (_, i) => {
                const size = _getLevelSize(d.id, i + 1);
                const done = completed.has(`${d.id}-${i+1}`);
                const stars = starsMap[`${d.id}-${i+1}`];
                return `<button class="level-card ${done ? 'level-done' : ''}" data-diff="${d.id}" data-level="${i+1}">
                  <span class="level-num">Nivel ${i+1}</span>
                  <span class="level-size">${size}×${size}</span>
                  ${done ? `<div class="level-stars">${_renderStarsHTML(stars ?? 0, 14)}</div>` : ''}
                </button>`;
              }).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _getLevelSize(difficulty, level) {
  const config = DIFFICULTY_CONFIG[difficulty - 1];
  const range = config.maxR - config.minR;
  return Math.round(config.minR + (range * (level - 1)) / 9);
}

function _renderCreateTab() {
  return `
    <div class="create-panel">
      <div class="create-inputs">
        <label>Filas <input type="number" id="create-rows" min="4" max="40" value="6"></label>
        <label>Columnas <input type="number" id="create-cols" min="4" max="40" value="6"></label>
        <button class="btn btn-secondary" id="create-random" title="Generar números aleatorios válidos">🎲 Aleatorio</button>
      </div>
      <div id="create-board-container" class="create-board-container"></div>
      <div id="create-status" class="create-status"></div>
      <div class="create-actions" id="create-actions" style="display:none; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary" id="create-verify" style="flex: 1;">Verificar</button>
          <button class="btn btn-primary" id="create-play" disabled style="flex: 1;">Jugar</button>
        </div>
        <button class="btn btn-secondary" id="create-library" style="width: 100%;" title="Ver y cargar mapas guardados">🗺️ Mis mapas</button>
      </div>
    </div>
  `;
}

function _renderUploadTab() {
  return `
    <div class="upload-panel">
      <div class="upload-format-collapse" style="display:flex; gap:8px; align-items:flex-start;">
        <details style="flex:1; min-width:0;">
          <summary>Formato .txt</summary>
          <div class="code-block">
            <p>[ANCHO] [ALTO]</p>
            <p>[CANTIDAD_DE_PISTAS]</p>
            <p>[FILA] [COLUMNA] [VALOR]</p>
            <p>[FILA] [COLUMNA] [VALOR]</p>
            <p>...</p>
            <br>
            <p class="code-example">Ejemplo Practico:</p>
            <p>Si tienes un tablero de <b>5x5</b> con tres pistas,</p>
            <p>el archivo se ve asi:</p>
            <pre>5 5
3
0 0 4
2 2 6
4 4 2</pre>
          </div>
        </details>
        <span id="upload-reupload-icon" title="Subir otro mapa" style="display:none; width:46px; height:46px; border-radius:10px; background:#e53e3e; color:#fff; font-size:22px; font-weight:bold; cursor:pointer; z-index:5; user-select:none; flex-shrink:0; align-items:center; justify-content:center;">+</span>
      </div>
      <div class="upload-dropzone" id="upload-dropzone">
        <div class="dropzone-content">
          ${ICONS.UPLOAD}
          <p>Arrastra tu .txt aqui<br>o haz clic para buscar</p>
          <input type="file" id="upload-input" accept=".txt" hidden>
        </div>
      </div>
      <div id="upload-preview" class="upload-preview"></div>
      <div id="upload-error" class="upload-error"></div>
      <div id="upload-actions" class="create-actions" style="display:none; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary" id="upload-verify" style="flex: 1;">Verificar</button>
          <button class="btn btn-primary" id="upload-play" disabled style="flex: 1;">Jugar</button>
        </div>
      </div>
      <button class="btn btn-secondary" id="upload-library" style="width: 100%;" title="Ver mapas subidos">🗺️ Mis mapas</button>
    </div>
  `;
}

function _renderExportTab() {
  const completed = _getCompletedLevels();
  const starsMap = _getStarsMap();
  const customMaps = _getCustomMaps();

  // Puzzles resueltos
  const solvedPuzzles = [];
  for (const key of completed) {
    const [d, l] = key.split('-').map(Number);
    const grid = _loadPuzzle(d, l);
    if (grid) {
      const config = DIFFICULTY_CONFIG[d - 1];
      solvedPuzzles.push({ difficulty: d, level: l, grid, name: config.name, stars: starsMap[key] ?? 0 });
    }
  }

  // Separar mapas creados y subidos
  const createdMaps = customMaps.filter(m => m.type !== 'uploaded');
  const uploadedMaps = customMaps.filter(m => m.type === 'uploaded');

  // Si no hay nada, mostrar vacío
  if (solvedPuzzles.length === 0 && customMaps.length === 0) {
    return `
      <div class="export-panel">
        <div class="export-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          <p>No hay mapas para exportar.</p>
          <p class="export-hint">Resuelve niveles o crea mapas personalizados.</p>
        </div>
      </div>
    `;
  }

  let html = '<div class="export-panel">';

  // Sección: Mapas resueltos
  if (solvedPuzzles.length > 0) {
    html += `
      <div class="export-section">
        <div class="export-section-header">
          <h4>Mapas resueltos</h4>
          <span class="export-count">${solvedPuzzles.length}</span>
        </div>
        <div class="export-list">
          ${solvedPuzzles.map(p => {
            const rows = p.grid.length;
            const cols = p.grid[0].length;
            const clues = extractClues(p.grid);
            return `
              <div class="export-card">
                <div class="export-card-info">
                  <span class="export-card-title">${p.name} — Nivel ${p.level}</span>
                  <span class="export-card-meta">${cols}×${rows} · ${clues.length} pistas · ${_renderStarsHTML(p.stars, 12)}</span>
                </div>
                <div class="export-card-actions">
                  <button class="btn btn-secondary btn-sm export-single" data-diff="${p.difficulty}" data-level="${p.level}">Exportar</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Sección: Mapas creados
  if (createdMaps.length > 0) {
    html += `
      <div class="export-section">
        <div class="export-section-header">
          <h4>Mapas creados</h4>
          <span class="export-count">${createdMaps.length}</span>
        </div>
        <div class="export-list">
          ${createdMaps.map(m => `
            <div class="export-card">
              <div class="export-card-info">
                <span class="export-card-title">${m.name}</span>
                <span class="export-card-meta">${m.clues} pistas · ${new Date(m.date).toLocaleDateString()}</span>
              </div>
              <div class="export-card-actions">
                <button class="btn btn-secondary btn-sm export-custom" data-id="${m.id}">Exportar</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Sección: Mapas subidos
  if (uploadedMaps.length > 0) {
    html += `
      <div class="export-section">
        <div class="export-section-header">
          <h4>Mapas subidos</h4>
          <span class="export-count">${uploadedMaps.length}</span>
        </div>
        <div class="export-list">
          ${uploadedMaps.map(m => `
            <div class="export-card">
              <div class="export-card-info">
                <span class="export-card-title">${m.name}</span>
                <span class="export-card-meta">${m.clues} pistas · ${new Date(m.date).toLocaleDateString()}</span>
              </div>
              <div class="export-card-actions">
                <button class="btn btn-secondary btn-sm export-custom" data-id="${m.id}">Exportar</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Botón de exportar todos
  if (solvedPuzzles.length > 0) {
    html += `
      <div class="export-all-section">
        <button class="btn btn-primary" id="export-all" style="width: 100%;">Exportar todos resueltos (.txt)</button>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════════
// EVENTOS DE TABS
// ══════════════════════════════════════════════════════════

function _bindTabEvents() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => _showTab(tab.dataset.tab));
  });
}

function _showTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabName}`));

  // Refrescar tab export al entrar
  if (tabName === 'export') {
    document.getElementById('tab-export').innerHTML = _renderExportTab();
    _bindExportEvents();
  }
}

// ══════════════════════════════════════════════════════════
// EVENTOS DEL TAB JUGAR
// ══════════════════════════════════════════════════════════

function _bindPlayEvents() {
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.difficulty-group');
      const panel = group.querySelector('.level-panel');
      document.querySelectorAll('.level-panel.open').forEach(p => {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.toggle('open');
    });
  });

  document.querySelectorAll('.level-card').forEach(card => {
    card.addEventListener('click', async () => {
      const diff = parseInt(card.dataset.diff);
      const level = parseInt(card.dataset.level);
      await _startGame(diff, level);
    });
  });
}

async function _startGame(difficulty, level) {
  state.activeDifficulty = difficulty;
  state.activeLevel = level;
  state.isCustomMap = false;
  state.activeCustomMapId = null;

  const config = DIFFICULTY_CONFIG[difficulty - 1];
  const { rows, cols } = getSizeForLevel(difficulty, level);
  const completed = _getCompletedLevels();
  const isCompleted = completed.has(`${difficulty}-${level}`);

  // Cargar puzzle guardado (si existe)
  let grid = _loadPuzzle(difficulty, level);

  if (!grid) {
    // Generar nuevo puzzle si no existe guardado
    _showLoadingOverlay(`Generando nivel ${level}...`);

    try {
      const result = await generatePuzzle(rows, cols, difficulty);
      grid = result.grid;

      // Guardar en localStorage
      _savePuzzle(difficulty, level, grid);
    } catch (err) {
      _hideLoadingOverlay();
      alert('Error al generar el puzzle. Intenta de nuevo.');
      return;
    }

    _hideLoadingOverlay();
  }

  state.currentGrid = grid;
  state.currentClues = extractClues(grid);

  // Limpiar sessionStorage para que se inicie limpio
  sessionStorage.removeItem('shikaku_game_state');

  _showGameScreen(grid, state.currentClues, { ...config, level });
}

function _startGameWithGrid(grid) {
  const clues = extractClues(grid);
  state.currentGrid = grid;
  state.currentClues = clues;
  state.isCustomMap = true;
  // Limpiar estado guardado para que siempre empiece desde cero
  sessionStorage.removeItem('shikaku_game_state');
  const config = state.activeDifficulty
    ? { ...DIFFICULTY_CONFIG[state.activeDifficulty - 1], level: state.activeLevel }
    : { id: 3, name: 'Personalizado', color: '#FAC775', textColor: '#633806', darkColor: '#7a4508', level: null };
  _showGameScreen(grid, clues, config);
}

// ══════════════════════════════════════════════════════════
// PANTALLA DE JUEGO
// ══════════════════════════════════════════════════════════

function _showGameScreen(grid, clues, config) {
  const gameScreen = document.getElementById('screen-game');
  state.currentScreen = 'game';
  state.gameInProgress = true;
  state.solverResult = null;
  state.solutionIndex = 0;
  state.currentStep = 0;
  state.autoPlaying = false;
  state.hintsUsed = 0;

  document.getElementById('screen-home').classList.remove('active');
  gameScreen.classList.add('active');

  gameScreen.innerHTML = `
    <div id="game-header" class="game-header" style="background:${config.darkColor || '#333'}">
      <div class="header-left">
        <button class="header-btn" id="btn-back" title="Volver">${ICONS.BACK}</button>
        <button class="header-btn" id="btn-restart" title="Reiniciar">${ICONS.RESTART}</button>
        <button class="header-btn" id="btn-hint" title="Pista">${ICONS.HINT}</button>
        <button class="header-btn btn-solve" id="btn-solve">${ICONS.PLAY}<span class="btn-text">Resolver</span></button>
      </div>
      <span class="info-level" id="level-label"><span class="level-full">${config.name}${config.level ? ' · Nivel ' + config.level : ''}</span><span class="level-short">${config.name ? config.name[0] : ''}${config.level ? ' - Nivel ' + config.level : ''}</span></span>
      <div class="header-right">
        <div class="header-info">
          <span class="info-icon">&#x23F1;</span><span class="info-val" id="timer-display">00:00</span>
        </div>
      </div>
    </div>
    <div id="step-bar" class="step-bar" style="display:none;background:${config.color || '#eee'}"></div>
    <div id="algo-sheet-backdrop" class="algo-sheet-backdrop" style="display:none"></div>
    <div id="algo-sheet" class="algo-sheet" style="display:none"><div id="algo-modal-inner" class="algo-sheet-inner"></div></div>
    <div id="board-container" class="board-container"></div>

    <div id="victory-modal" class="modal-overlay victory-fireworks" style="display:none">
      <div class="modal-content victory-modal">
        <h2>🎉 ¡Resuelto! 🎉</h2>
        <div class="victory-stars" id="v-stars"></div>
        <div class="victory-stats">
          <div class="v-stat"><span>Tiempo:</span><span id="v-time"></span></div>
          <div class="v-stat"><span>Dificultad:</span><span id="v-diff"></span></div>
          <div class="v-stat"><span>Nivel:</span><span id="v-level"></span></div>
          <div class="v-stat"><span>Pistas usadas:</span><span id="v-hints"></span></div>
        </div>
        <div class="victory-actions">
          <button class="btn btn-secondary" id="v-replay">Volver a jugar</button>
          <button class="btn btn-primary" id="v-next">Siguiente nivel</button>
          <button class="btn btn-secondary" id="v-home">Inicio</button>
        </div>
      </div>
    </div>

    <div id="confirm-modal" class="modal-overlay" style="display:none">
      <div class="modal-content confirm-modal">
        <p>¿Abandonar partida?</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
          <button class="btn btn-primary" id="confirm-ok">Salir</button>
        </div>
      </div>
    </div>
  `;

  const boardContainer = document.getElementById('board-container');
  state.activeBoard = new Board(boardContainer, grid, clues, {
    onVictory: () => _onVictory(config)
  });

  _tryRestoreGameState();
  _startTimer();
  _bindGameEvents(config);
}

function _bindGameEvents(config) {
  document.getElementById('btn-back').addEventListener('click', () => {
    if (state.gameInProgress) {
      const modal = document.getElementById('confirm-modal');
      modal.style.display = 'flex';
      document.getElementById('confirm-cancel').onclick = () => modal.style.display = 'none';
      document.getElementById('confirm-ok').onclick = () => {
        modal.style.display = 'none';
        _goHome();
      };
    } else {
      _goHome();
    }
  });

  document.getElementById('btn-restart').addEventListener('click', () => {
    if (state.activeBoard) {
      state.activeBoard.reset();
      state.timerSeconds = 0;
      _startTimer();
      const statsBarEl = document.getElementById('stats-bar');
      if (statsBarEl) statsBarEl.style.display = 'none';
      document.getElementById('step-bar').style.display = 'none';
      state.solverResult = null;
      state.autoPlaying = false;
      if (state.autoPlayInterval) { clearInterval(state.autoPlayInterval); state.autoPlayInterval = null; }
      const solveBtn = document.getElementById('btn-solve');
      if (solveBtn) solveBtn.innerHTML = `${ICONS.PLAY}<span class="btn-text">Resolver</span>`;
      const algoBtn2 = document.getElementById('btn-algo');
      if (algoBtn2) algoBtn2.style.display = 'none';
      const hintBtn = document.getElementById('btn-hint');
      if (hintBtn) { hintBtn.disabled = false; hintBtn.title = ''; }
    }
  });

  // Pista: resuelve UNA pista automáticamente
  // 1. Intenta sugerir una pista NO marcada con espacio libre
  // 2. Si todas las no marcadas están bloqueadas, corrige una marcada incorrectamente
  document.getElementById('btn-hint').addEventListener('click', () => {
    if (!state.activeBoard || !state.currentClues) return;
    if (state.solverResult) return; // solucionador abierto
    const grid = state.currentGrid;
    const clues = state.currentClues;
    const rows = grid.length;
    const cols = grid[0].length;
    const board = state.activeBoard;

    // Resolver para saber las respuestas correctas
    const result = solve(grid, clues, 1, 5000);
    if (!result.solutions || result.solutions.length === 0) return;
    const solution = result.solutions[0];

    // Crear mapa de clueIdx → solución para búsqueda correcta
    // (el array de solución NO está indexado por clueIdx)
    const solByClue = new Map();
    for (const entry of solution) {
      const ci = clues.findIndex(c => c.row === entry.clue.row && c.col === entry.clue.col);
      if (ci !== -1) solByClue.set(ci, entry.rect);
    }

    // Paso 1: buscar pistas NO marcadas con espacio libre
    let targetIdx = -1;
    let bestCount = Infinity;

    for (let i = 0; i < clues.length; i++) {
      if (board.playerRegions.has(i)) continue;
      if (!solByClue.has(i)) continue;

      const cands = getCandidates(clues[i], rows, cols);
      let validCount = 0;
      for (const rect of cands) {
        let free = true;
        for (let r = rect.r0; r < rect.r0 + rect.h && free; r++) {
          for (let c = rect.c0; c < rect.c0 + rect.w && free; c++) {
            if (board.occupationMap[r][c] !== -1) free = false;
          }
        }
        if (free) validCount++;
      }
      if (validCount > 0 && validCount < bestCount) {
        bestCount = validCount;
        targetIdx = i;
      }
    }

    // Paso 2: si no hay pistas libres, buscar una marcada INCORRECTAMENTE y corregirla
    if (targetIdx === -1) {
      for (let i = 0; i < clues.length; i++) {
        if (!board.playerRegions.has(i)) continue;
        if (!solByClue.has(i)) continue;
        const pRect = board.playerRegions.get(i);
        const sRect = solByClue.get(i);
        const isCorrect = pRect.r0 === sRect.r0 && pRect.c0 === sRect.c0 &&
                          pRect.w === sRect.w && pRect.h === sRect.h;
        if (!isCorrect) {
          // Remover la región incorrecta
          for (let r = pRect.r0; r < pRect.r0 + pRect.h; r++) {
            for (let c = pRect.c0; c < pRect.c0 + pRect.w; c++) {
              if (board.occupationMap[r][c] === i) {
                board.occupationMap[r][c] = -1;
              }
            }
          }
          board.playerRegions.delete(i);
          targetIdx = i;
          break;
        }
      }
    }

    if (targetIdx === -1) return;

    // Colocar la respuesta correcta
    const solRect = solByClue.get(targetIdx);
    board.playerRegions.set(targetIdx, solRect);
    for (let r = solRect.r0; r < solRect.r0 + solRect.h; r++) {
      for (let c = solRect.c0; c < solRect.c0 + solRect.w; c++) {
        board.occupationMap[r][c] = targetIdx;
      }
    }
    state.hintsUsed++;
    board.render();
    board.showHintPulse(targetIdx);
    board._checkVictory();
  });

  document.getElementById('btn-solve').addEventListener('click', () => _runSolver(config));


  document.getElementById('v-next').addEventListener('click', () => {
    document.getElementById('victory-modal').style.display = 'none';
    if (state.activeLevel && state.activeLevel < LEVELS_PER_DIFFICULTY) {
      _startGame(state.activeDifficulty, state.activeLevel + 1);
    } else {
      _goHome();
    }
  });

  document.getElementById('v-replay').addEventListener('click', () => {
    document.getElementById('victory-modal').style.display = 'none';
    if (state.activeDifficulty && state.activeLevel && !state.isCustomMap) {
      _startGame(state.activeDifficulty, state.activeLevel);
    } else if (state.isCustomMap && state.currentGrid) {
      _startGameWithGrid(state.currentGrid);
    }
  });

  document.getElementById('v-home').addEventListener('click', () => {
    document.getElementById('victory-modal').style.display = 'none';
    _goHome();
  });
}

// ══════════════════════════════════════════════════════════
// SOLVER
// ══════════════════════════════════════════════════════════

async function _runSolver(config) {
  const btn = document.getElementById('btn-solve');
  const hintBtn = document.getElementById('btn-hint');
  btn.disabled = true;
  hintBtn.style.pointerEvents = 'auto';
  hintBtn.style.opacity = '1';
  btn.innerHTML = `<span class="spinner-inline"></span><span class="btn-text">Resolviendo...</span>`;

  const grid = state.currentGrid;
  const clues = state.currentClues;

  try {
    if (window.Worker) {
      const result = await _solveInWorker(grid, clues);
      _onSolverDone(result, config);
    } else {
      await new Promise(r => setTimeout(r, 0));
      const result = solve(grid, clues, SOLVER_CONFIG.maxSolutions, SOLVER_CONFIG.timeoutMs);
      _onSolverDone(result, config);
    }
  } catch (err) {
    console.error('Error del solver:', err);
    btn.disabled = false;
    btn.innerHTML = `${ICONS.PLAY}<span class="btn-text">Resolver</span>`;
  }
}

function _solveInWorker(grid, clues) {
  return new Promise((resolve, reject) => {
    if (state.solverWorker) state.solverWorker.terminate();

    state.solverWorker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });

    state.solverWorker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'PROGRESS') {
        const btn = document.getElementById('btn-solve');
        const nodes = msg.nodesExplored > 1e6
          ? `${(msg.nodesExplored / 1e6).toFixed(1)}M`
          : msg.nodesExplored > 1e3
          ? `${(msg.nodesExplored / 1e3).toFixed(0)}K`
          : msg.nodesExplored;
        btn.querySelector('.btn-text').textContent = `Resolviendo... ${nodes} nodos`;
      } else if (msg.type === 'DONE') {
        resolve(msg.result);
      } else if (msg.type === 'ERROR') {
        reject(new Error(msg.error));
      }
    };

    state.solverWorker.onerror = (err) => reject(err);

    state.solverWorker.postMessage({
      type: 'SOLVE', grid, clues,
      maxSolutions: SOLVER_CONFIG.maxSolutions,
      timeoutMs: SOLVER_CONFIG.workerTimeoutMs
    });
  });
}

function _onSolverDone(result, config) {
  if (!state.activeBoard) return;

  state.solverResult = result;
  state.gameInProgress = false;
  _stopTimer();

  const btn = document.getElementById('btn-solve');
  const hintBtn = document.getElementById('btn-hint');
  btn.disabled = false;
  hintBtn.style.pointerEvents = 'auto';
  hintBtn.style.opacity = '1';
  btn.innerHTML = `${ICONS.PLAY}<span class="btn-text">Resolver</span>`;

  const algoBtn = document.getElementById('btn-algo');
  if (algoBtn) algoBtn.style.display = '';

  if (result.solutions.length > 0) {
    state.solutionIndex = 0;
    const sol = result.solutions[0];
    state.activeBoard.recolorWithSolution(sol);
    state.activeBoard.lock();
    state.currentStep = 0;
    state.activeBoard.showSolutionStep(sol, 0);
  }

  // Verificación: validar soluciones almacenadas + conteo BT
  const grid = state.activeBoard?.grid;
  if (grid) {
    // 1. Validar cada solución almacenada
    let allValid = true;
    for (const sol of result.solutions) {
      const v = validateSolution(grid, sol);
      if (!v.valid) { allValid = false; result.validationError = v.error; break; }
    }
    result.solutionsValid = allValid;

    // 2. Conteo cruzado con BT
    const clues = extractClues(grid);
    const btResult = countSolutionsBT(grid, clues, SOLVER_CONFIG.maxSolutions, SOLVER_CONFIG.timeoutMs);
    result.btCount = btResult.count;
    result.btTimedOut = btResult.timedOut;
    result.btTimeMs = btResult.timeMs;
  }

  _showStepBar(result, config);

  if (result.solutions.length > 0) {
    _startAutoPlay(result);
  }
}

function _startAutoPlay(result) {
  const autoBtn = document.getElementById('step-auto');
  if (state.autoPlaying) return;
  state.autoPlaying = true;
  if (autoBtn) autoBtn.innerHTML = ICONS.PAUSE;

  state.autoPlayInterval = setInterval(() => {
    const sol = result.solutions[state.solutionIndex];
    if (state.currentStep >= sol.length) {
      clearInterval(state.autoPlayInterval);
      state.autoPlayInterval = null;
      state.autoPlaying = false;
      if (autoBtn) autoBtn.innerHTML = ICONS.PLAY;
      return;
    }
    if (!state.activeBoard) { _stopAutoPlay(); return; }
    state.currentStep++;
    const label = document.getElementById('step-label');
    if (label) label.textContent = window.innerWidth <= 768 ? `${state.currentStep}/${sol.length}` : `Paso ${state.currentStep} de ${sol.length}`;
    state.activeBoard.showSolutionStep(sol, state.currentStep);
  }, 500);
}

function _stopAutoPlay() {
  if (state.autoPlayInterval) {
    clearInterval(state.autoPlayInterval);
    state.autoPlayInterval = null;
  }
  state.autoPlaying = false;
  const autoBtn = document.getElementById('step-auto');
  if (autoBtn) autoBtn.innerHTML = ICONS.PLAY;
}

function _showAlgoModal(result) {
  const backdrop = document.getElementById('algo-sheet-backdrop');
  const sheet = document.getElementById('algo-sheet');
  const inner = document.getElementById('algo-modal-inner');
  if (!sheet || !inner) return;

  const s = result.stats;
  const totalSols = result.count;
  const perClue = s.perClue || [];
  const timeoutNote = result.timedOut ? ' <span class="algo-badge algo-warn">timeout</span>' : '';

  // Filas de la tabla — una por pista
  const rows = perClue.map((pc, i) => {
    const { clue, candidates, rectChosen } = pc;
    const rect = rectChosen;
    const rectStr = rect
      ? `fila ${rect.r0+1}, col ${rect.c0+1} → ${rect.w}×${rect.h}`
      : '—';
    const areaStr = rect ? `${rect.w * rect.h} celdas` : '—';
    return `
      <tr>
        <td class="algo-step">${i + 1}</td>
        <td class="algo-pos">(${clue.row+1}, ${clue.col+1})</td>
        <td class="algo-val">${clue.value}</td>
        <td class="algo-cands ${candidates <= 2 ? 'algo-cand-low' : candidates <= 5 ? 'algo-cand-mid' : ''}">${candidates}</td>
        <td class="algo-rect">${rectStr}</td>
        <td class="algo-area">${areaStr}</td>
      </tr>`;
  }).join('');

  inner.innerHTML = `
    <div class="algo-drag-handle"></div>
    <div class="algo-header">
      <div class="algo-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ¿Cómo llegó a esta solución?
      </div>
      <button class="algo-close" id="algo-close-btn">✕</button>
    </div>

    <div class="algo-explain-cards">
      <div class="algo-explain-card algo-card-blue">
        <div class="algo-card-icon">🔁</div>
        <div class="algo-card-body">
          <strong>Backtracking</strong>
          <span>Prueba colocar un rectángulo, si falla retrocede e intenta otro</span>
        </div>
      </div>
      <div class="algo-explain-card algo-card-purple">
        <div class="algo-card-icon">🎯</div>
        <div class="algo-card-body">
          <strong>Heurística MRV</strong>
          <span>Ataca primero la pista con <em>menos opciones</em> — reduce ramificaciones</span>
        </div>
      </div>
      <div class="algo-explain-card algo-card-green">
        <div class="algo-card-icon">✂️</div>
        <div class="algo-card-body">
          <strong>Poda</strong>
          <span>Descarta caminos sin salida antes de explorarlos</span>
        </div>
      </div>
    </div>

    <div class="algo-stats-row">
      <span class="algo-stat-pill">DLX: ${totalSols.toLocaleString()}${timeoutNote} sol</span>
      ${result.btCount != null ? `<span class="algo-stat-pill" style="${result.btCount === totalSols || (result.btTimedOut && result.btCount <= totalSols) ? '' : 'background:#fdd;color:#c00;'}">BT: ${result.btCount.toLocaleString()}${result.btTimedOut ? '+' : ''} sol</span>` : ''}
      ${result.solutionsValid != null ? `<span class="algo-stat-pill" style="${result.solutionsValid ? 'background:#dfd;' : 'background:#fdd;color:#c00;'}">Validacion: ${result.solutionsValid ? 'OK' : result.validationError}</span>` : ''}
      <span class="algo-stat-pill">DLX: ${s.timeMs.toFixed(1)}ms${result.btTimeMs != null ? ` | BT: ${result.btTimeMs.toFixed(0)}ms` : ''}</span>
      <span class="algo-stat-pill">${s.nodesExplored > 1e6 ? (s.nodesExplored/1e6).toFixed(1)+'M' : s.nodesExplored > 1e3 ? (s.nodesExplored/1e3).toFixed(0)+'K' : s.nodesExplored} nodos</span>
    </div>

    <p class="algo-section-title">Orden de decisiones (solución ${state.solutionIndex + 1})</p>

    <div class="algo-table-wrap">
      <table class="algo-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pista</th>
            <th>Valor</th>
            <th title="Rectángulos válidos disponibles en ese momento del backtracking">Opciones</th>
            <th>Rectángulo elegido</th>
            <th>Área</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="algo-legend-row">
      <span class="algo-legend-dot algo-cand-low"></span><span>1-2 opciones (muy restringido)</span>
      <span class="algo-legend-dot algo-cand-mid"></span><span>3-5 opciones</span>
      <span class="algo-legend-dot algo-cand-hi"></span><span>6+ opciones (libre)</span>
    </div>
  `;

  backdrop.style.display = 'block';
  sheet.style.display = 'flex';
  requestAnimationFrame(() => { sheet.classList.add('algo-sheet-open'); backdrop.classList.add('algo-sheet-open'); });

  const close = () => {
    sheet.classList.remove('algo-sheet-open'); backdrop.classList.remove('algo-sheet-open');
    setTimeout(() => { sheet.style.display = 'none'; backdrop.style.display = 'none'; }, 300);
  };
  document.getElementById('algo-close-btn').addEventListener('click', close);
  backdrop.addEventListener('click', close);
}

function _showStepBar(result, config) {
  if (result.solutions.length === 0) return;

  const bar = document.getElementById('step-bar');
  bar.style.display = 'flex';

  // Deshabilitar pista mientras el solucionador está abierto
  const hintBtn = document.getElementById('btn-hint');
  if (hintBtn) { hintBtn.disabled = true; hintBtn.title = 'No disponible mientras el solucionador está abierto'; }

  const totalSolutions = result.solutions.length;
  const sol = result.solutions[state.solutionIndex];
  const totalSteps = sol.length;

  const countLabel = result.count.toLocaleString();
  const timedOutNote = result.timedOut ? '+' : '';
  const navLabel = `${state.solutionIndex + 1}/${totalSolutions}`;
  const countTitle = result.timedOut
    ? `Tiempo límite alcanzado — ${countLabel}+ soluciones encontradas, puede haber más`
    : `${countLabel} solución${result.count !== 1 ? 'es' : ''} encontrada${result.count !== 1 ? 's' : ''}`;

  bar.innerHTML = `
    <div class="step-controls">
      <span class="step-sol-nav">
        ${totalSolutions > 1 ? `<button class="step-btn" id="step-sol-prev">${ICONS.PREV}</button>` : ''}
        <span id="step-sol-num" class="step-sol-count" title="${countTitle}">${navLabel} <small>(${countLabel}${timedOutNote})</small></span>
        ${totalSolutions > 1 ? `<button class="step-btn" id="step-sol-next">${ICONS.NEXT}</button>` : ''}
      </span>
      <span class="step-sep">|</span>
      <button class="step-btn" id="step-first">${ICONS.FIRST}</button>
      <button class="step-btn" id="step-prev">${ICONS.PREV}</button>
      <span class="step-label" id="step-label">${window.innerWidth <= 768 ? `${state.currentStep}/${totalSteps}` : `Paso ${state.currentStep} de ${totalSteps}`}</span>
      <button class="step-btn" id="step-next">${ICONS.NEXT}</button>
      <button class="step-btn" id="step-last">${ICONS.LAST}</button>
      <button class="step-btn step-auto" id="step-auto">${state.autoPlaying ? ICONS.PAUSE : ICONS.PLAY}</button>
      <span class="step-sep"></span>
      <button class="step-btn step-algo-btn" id="step-algo-btn" title="¿Cómo llegó a esto?">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </button>
    </div>
  `;

  const updateStep = () => {
    const currentSol = result.solutions[state.solutionIndex];
    document.getElementById('step-label').textContent = window.innerWidth <= 768
      ? `${state.currentStep}/${currentSol.length}`
      : `Paso ${state.currentStep} de ${currentSol.length}`;
    state.activeBoard.showSolutionStep(currentSol, state.currentStep);
  };

  document.getElementById('step-first').addEventListener('click', () => { _stopAutoPlay(); state.currentStep = 0; updateStep(); });
  document.getElementById('step-prev').addEventListener('click', () => { _stopAutoPlay(); if (state.currentStep > 0) state.currentStep--; updateStep(); });
  document.getElementById('step-next').addEventListener('click', () => { _stopAutoPlay(); const s = result.solutions[state.solutionIndex]; if (state.currentStep < s.length) state.currentStep++; updateStep(); });
  document.getElementById('step-last').addEventListener('click', () => { _stopAutoPlay(); state.currentStep = result.solutions[state.solutionIndex].length; updateStep(); });

  document.getElementById('step-auto').addEventListener('click', () => {
    if (state.autoPlaying) {
      _stopAutoPlay();
    } else {
      const sol = result.solutions[state.solutionIndex];
      if (state.currentStep >= sol.length) { state.currentStep = 0; updateStep(); }
      _startAutoPlay(result);
    }
  });

  document.getElementById('step-algo-btn').addEventListener('click', () => { if (state.solverResult) _showAlgoModal(state.solverResult); });

  const solPrevBtn = document.getElementById('step-sol-prev');
  const solNextBtn = document.getElementById('step-sol-next');
  const solNumEl = document.getElementById('step-sol-num');
  function _updateSolLabel() {
    if (solNumEl) solNumEl.innerHTML = `${state.solutionIndex + 1}/${totalSolutions} <small>(${countLabel}${timedOutNote})</small>`;
  }
  if (solPrevBtn) solPrevBtn.addEventListener('click', () => {
    if (state.solutionIndex > 0) {
      state.solutionIndex--; state.currentStep = 0;
      _updateSolLabel();
      state.activeBoard.recolorWithSolution(result.solutions[state.solutionIndex]); updateStep();
      _startAutoPlay(result);
    }
  });
  if (solNextBtn) solNextBtn.addEventListener('click', () => {
    if (state.solutionIndex < totalSolutions - 1) {
      state.solutionIndex++; state.currentStep = 0;
      _updateSolLabel();
      state.activeBoard.recolorWithSolution(result.solutions[state.solutionIndex]); updateStep();
      _startAutoPlay(result);
    }
  });
}

// ══════════════════════════════════════════════════════════
// VICTORIA
// ══════════════════════════════════════════════════════════

function _onVictory(config) {
  state.gameInProgress = false;
  _stopTimer();

  const totalClues = state.currentClues ? state.currentClues.length : 0;
  const stars = _calcStars(state.hintsUsed, totalClues, state.activeDifficulty);

  if (state.activeDifficulty && state.activeLevel && !state.isCustomMap) {
    _markLevelCompleted(state.activeDifficulty, state.activeLevel);
    _saveStars(state.activeDifficulty, state.activeLevel, stars);
  } else if (state.isCustomMap && state.activeCustomMapId) {
    _saveCustomMapStars(state.activeCustomMapId, stars);
  }

  const modal = document.getElementById('victory-modal');
  document.getElementById('v-stars').innerHTML = _renderStarsHTML(stars, 36);
  document.getElementById('v-time').textContent = _formatTime(state.timerSeconds);
  document.getElementById('v-diff').textContent = config.name || 'Personalizado';
  document.getElementById('v-level').textContent = state.activeLevel || '—';
  document.getElementById('v-hints').textContent = `${state.hintsUsed} de ${totalClues}`;

  // Ocultar botón "Siguiente nivel" para mapas personalizados
  const nextBtn = document.getElementById('v-next');
  if (state.isCustomMap) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = 'block';
  }

  modal.style.display = 'flex';
}

// ══════════════════════════════════════════════════════════
// CRONÓMETRO
// ══════════════════════════════════════════════════════════

function _startTimer() {
  _stopTimer();
  state.timerSeconds = 0;
  const display = document.getElementById('timer-display');
  if (display) display.textContent = '00:00';

  state.timer = setInterval(() => {
    state.timerSeconds++;
    const display = document.getElementById('timer-display');
    if (display) {
      display.textContent = _formatTime(state.timerSeconds);
      if (state.timerSeconds >= 600) display.classList.add('timer-red');
    }
    _saveGameState();
  }, 1000);
}

function _stopTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (state.autoPlayInterval) { clearInterval(state.autoPlayInterval); state.autoPlayInterval = null; state.autoPlaying = false; }
}

function _formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ══════════════════════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════════════════════

function _goHome() {
  _stopTimer();
  if (state.activeBoard) { state.activeBoard.destroy(); state.activeBoard = null; }
  state.gameInProgress = false;
  state.currentScreen = 'home';

  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');

  // Refrescar niveles
  const playTab = document.getElementById('tab-play');
  if (playTab) { playTab.innerHTML = _renderPlayTab(); _bindPlayEvents(); }
}

// ══════════════════════════════════════════════════════════
// TAB CREAR
// ══════════════════════════════════════════════════════════

function _bindCreateEvents() {
  const rowsInput = document.getElementById('create-rows');
  const colsInput = document.getElementById('create-cols');

  const clamp = (v) => Math.max(4, Math.min(40, parseInt(v) || 4));

  const autoGenerate = () => {
    _createEditableGrid(clamp(rowsInput.value), clamp(colsInput.value));
  };

  // Actualizar grid mientras escribe
  rowsInput?.addEventListener('input', autoGenerate);
  colsInput?.addEventListener('input', autoGenerate);
  // Al salir del campo, mostrar el valor real (clampear visualmente)
  const fixDisplay = (input) => { input.value = clamp(input.value); };
  rowsInput?.addEventListener('change', () => fixDisplay(rowsInput));
  colsInput?.addEventListener('change', () => fixDisplay(colsInput));
  autoGenerate();
}

function _createEditableGrid(rows, cols) {
  const container = document.getElementById('create-board-container');
  const isPC = window.innerWidth > 768;
  const maxCellSize = isPC ? 72 : 48;
  const minCellSize = 24; // mínimo legible para 2+ dígitos
  const availableW = isPC ? Math.min(window.innerWidth * 0.5, 620) : window.innerWidth - 48;
  const cellSize = Math.max(minCellSize, Math.min(maxCellSize, Math.floor(availableW / cols)));
  const fontSize = Math.max(9, Math.floor(cellSize * 0.42));
  const maxValue = rows * cols;

  // Scroll horizontal si el grid no cabe
  const gridW = cellSize * cols;
  container.style.overflowX = gridW > availableW ? 'auto' : 'hidden';

  let html = `<table class="editable-grid" style="width:${gridW}px;table-layout:fixed">`;
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      html += `<td class="edit-cell" style="width:${cellSize}px;height:${cellSize}px;font-size:${fontSize}px">
                <input type="number" min="0" max="${maxValue}" value="" placeholder="0" class="cell-input" data-r="${r}" data-c="${c}">
              </td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  container.innerHTML = html;

  document.getElementById('create-actions').style.display = 'flex';
  document.getElementById('create-play').disabled = true;
  document.getElementById('create-status').innerHTML = '';
  container.dataset.rows = rows;
  container.dataset.cols = cols;

  // Actualizar suma en tiempo real
  const updateSum = () => {
    let sum = 0;
    container.querySelectorAll('.cell-input').forEach(input => {
      const val = parseInt(input.value) || 0;
      if (val > maxValue) input.value = maxValue;
      sum += Math.min(val, maxValue);
    });
    const statusEl = document.getElementById('create-status');
    if (sum > 0) {
      const expected = rows * cols;
      const matches = sum === expected;
      statusEl.innerHTML = `<div class="sum-display ${matches ? 'sum-valid' : 'sum-invalid'}">Suma: ${sum}/${expected}</div>`;
    }
  };

  container.querySelectorAll('.cell-input').forEach(input => {
    input.addEventListener('input', updateSum);
  });

  document.getElementById('create-verify').onclick = () => {
    const g = _readEditableGrid();
    if (g) {
      _verifyCreatedMap(g);
      // Auto-guardar solo si no existe ya
      if (!_findDuplicateMap(g)) {
        const clues = extractClues(g);
        const defaultName = `${cols}×${rows} · ${clues.length}📍`;
        _saveCustomMap(g, defaultName);
      }
    }
  };

  document.getElementById('create-play').onclick = () => {
    const g = _readEditableGrid();
    if (!g) return;
    state.activeDifficulty = null;
    state.activeLevel = null;
    // Recuperar ID del mapa guardado para poder guardar estrellas
    const existing = _findDuplicateMap(g);
    state.activeCustomMapId = existing ? existing.id : null;
    _startGameWithGrid(g);
  };

  document.getElementById('create-library').onclick = () => {
    _showLibrary('created');
  };

  document.getElementById('create-random').onclick = async () => {
    const randomBtn = document.getElementById('create-random');
    randomBtn.disabled = true;
    randomBtn.textContent = '⏳ Generando...';
    try {
      // Área máx sube progresivamente: 10×10→40, 15→50, 20→60, 25→70, 30→80, 35→90, 40→100
      const maxArea = Math.min(100, 20 + Math.min(rows, cols) * 2);
      const result = await generatePuzzle(rows, cols, 3, false, maxArea);
      const inputs = container.querySelectorAll('.cell-input');
      inputs.forEach(input => {
        const r = parseInt(input.dataset.r);
        const c = parseInt(input.dataset.c);
        const val = result.grid[r][c];
        input.value = val > 0 ? val : '';
      });
      // Actualizar suma
      container.querySelectorAll('.cell-input').forEach(inp => inp.dispatchEvent(new Event('input')));
    } catch (e) {
      // silenciar error
    } finally {
      randomBtn.disabled = false;
      randomBtn.textContent = '🎲 Aleatorio';
    }
  };
}

function _readEditableGrid() {
  const container = document.getElementById('create-board-container');
  const rows = parseInt(container.dataset.rows);
  const cols = parseInt(container.dataset.cols);
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  container.querySelectorAll('.cell-input').forEach(input => {
    const r = parseInt(input.dataset.r);
    const c = parseInt(input.dataset.c);
    grid[r][c] = parseInt(input.value) || 0;
  });
  return grid;
}

async function _verifyCreatedMap(grid) {
  const status = document.getElementById('create-status');
  const playBtn = document.getElementById('create-play');
  const verifyBtn = document.getElementById('create-verify');

  const clues = extractClues(grid);
  if (clues.length === 0) {
    status.innerHTML = '<span class="badge badge-red">Agrega al menos un numero como pista.</span>';
    return;
  }

  const maxCell = grid.length * grid[0].length;
  const invalidClue = clues.find(c => c.value > maxCell);
  if (invalidClue) {
    status.innerHTML = `<span class="badge badge-red">Error: Número ${invalidClue.value} excede el máximo posible (${maxCell}). Revisa los números.</span>`;
    playBtn.disabled = true;
    return;
  }

  const sumClues = clues.reduce((s, c) => s + c.value, 0);
  const cells = grid.length * grid[0].length;
  const sumStatus = sumClues === cells
    ? ` (suma correcta: ${sumClues}/${cells})`
    : ` (suma: ${sumClues}/${cells})`;

  // Timeout escalado: 2s para pequeños, hasta 8s para grandes
  const verifyTimeout = cells <= 900 ? 1000 : cells < 1600 ? 2000 : 6000;

  // Terminate any previous verify worker
  if (state.verifyWorker) { state.verifyWorker.terminate(); state.verifyWorker = null; }

  verifyBtn.disabled = true;
  status.innerHTML = '<div class="verify-loading"><span class="spinner-inline spinner-dark"></span> Verificando...</div>';

  try {
    const result = await new Promise((resolve, reject) => {
      state.verifyWorker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
      state.verifyWorker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'PROGRESS') {
          const n = msg.nodesExplored;
          const nodes = n > 1e6 ? `${(n/1e6).toFixed(1)}M nodos` : n > 1e3 ? `${(n/1e3).toFixed(0)}K nodos` : `${n} nodos`;
          status.innerHTML = `<div class="verify-loading"><span class="spinner-inline spinner-dark"></span> Verificando... ${nodes}</div>`;
        } else if (msg.type === 'DONE') {
          state.verifyWorker.terminate(); state.verifyWorker = null;
          resolve(msg.result);
        } else if (msg.type === 'ERROR') {
          state.verifyWorker.terminate(); state.verifyWorker = null;
          reject(new Error(msg.error));
        }
      };
      state.verifyWorker.onerror = (err) => { state.verifyWorker = null; reject(err); };
      state.verifyWorker.postMessage({ type: 'SOLVE', grid, clues, maxSolutions: Infinity, timeoutMs: verifyTimeout });
    });

    const countText = result.count.toLocaleString() + (result.timedOut ? '+' : '');
    const verifyNote = `<br><small style="color:#555">DLX: ${countText} (${result.stats.timeMs.toFixed(0)}ms)</small>`;

    if (result.count >= 1) {
      const label = result.count === 1 && !result.timedOut ? 'solución única' : `${countText} soluciones`;
      status.innerHTML = `<span class="badge badge-green">✓ Válido con ${label}${sumStatus}</span>${verifyNote}`;
      playBtn.disabled = false;
    } else {
      status.innerHTML = `<span class="badge badge-red">✗ Sin solución. Revisa los números.</span>${verifyNote}`;
      playBtn.disabled = true;
    }
  } catch (err) {
    status.innerHTML = `<span class="badge badge-red">Error al verificar: ${err.message}</span>`;
  } finally {
    verifyBtn.disabled = false;
  }
}

async function _verifyUploadedMap(grid) {
  const status = document.getElementById('upload-preview');
  const verifyBtn = document.getElementById('upload-verify');
  const playBtn = document.getElementById('upload-play');

  const clues = extractClues(grid);
  if (clues.length === 0) {
    status.innerHTML += '<div class="verify-result"><span class="badge badge-red">Error: El mapa no tiene pistas.</span></div>';
    return;
  }

  const maxCell = grid.length * grid[0].length;
  const invalidClue = clues.find(c => c.value > maxCell);
  if (invalidClue) {
    status.innerHTML += `<div class="verify-result"><span class="badge badge-red">Error: Número ${invalidClue.value} excede el máximo posible (${maxCell}).</span></div>`;
    playBtn.disabled = true;
    return;
  }

  const sumClues = clues.reduce((s, c) => s + c.value, 0);
  const cells = grid.length * grid[0].length;
  const sumStatus = sumClues === cells
    ? ` (suma correcta: ${sumClues}/${cells})`
    : ` (suma: ${sumClues}/${cells})`;

  const verifyTimeout = cells <= 900 ? 1000 : cells < 1600 ? 2000 : 6000;

  // Terminate any previous verify worker
  if (state.verifyWorker) { state.verifyWorker.terminate(); state.verifyWorker = null; }

  verifyBtn.disabled = true;
  verifyBtn.innerHTML = '<span class="spinner-inline spinner-dark"></span> Verificando...';

  // Remove any previous verify result
  const prev = status.querySelector('.verify-result');
  if (prev) prev.remove();

  try {
    const result = await new Promise((resolve, reject) => {
      state.verifyWorker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
      state.verifyWorker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'PROGRESS') {
          const n = msg.nodesExplored;
          const nodes = n > 1e6 ? `${(n/1e6).toFixed(1)}M nodos` : n > 1e3 ? `${(n/1e3).toFixed(0)}K nodos` : `${n} nodos`;
          verifyBtn.innerHTML = `<span class="spinner-inline spinner-dark"></span> ${nodes}`;
        } else if (msg.type === 'DONE') {
          state.verifyWorker.terminate(); state.verifyWorker = null;
          resolve(msg.result);
        } else if (msg.type === 'ERROR') {
          state.verifyWorker.terminate(); state.verifyWorker = null;
          reject(new Error(msg.error));
        }
      };
      state.verifyWorker.onerror = (err) => { state.verifyWorker = null; reject(err); };
      state.verifyWorker.postMessage({ type: 'SOLVE', grid, clues, maxSolutions: Infinity, timeoutMs: verifyTimeout });
    });

    const countText = result.count.toLocaleString() + (result.timedOut ? '+' : '');
    const verifyNote = `<br><small style="color:#555">DLX: ${countText} (${result.stats.timeMs.toFixed(0)}ms)</small>`;

    if (result.count >= 1) {
      const label = result.count === 1 && !result.timedOut ? 'solución única' : `${countText} soluciones`;
      status.innerHTML += `<div class="verify-result"><span class="badge badge-green">✓ Válido con ${label}${sumStatus}</span>${verifyNote}</div>`;
      playBtn.disabled = false;
    } else {
      status.innerHTML += `<div class="verify-result"><span class="badge badge-red">✗ Sin solución.</span>${verifyNote}</div>`;
      playBtn.disabled = true;
    }
  } catch (err) {
    status.innerHTML += `<div class="verify-result"><span class="badge badge-red">Error al verificar: ${err.message}</span></div>`;
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.innerHTML = 'Verificar mapa';
  }
}

// ══════════════════════════════════════════════════════════
// TAB SUBIR
// ══════════════════════════════════════════════════════════

function _bindUploadEvents() {
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-input');
  if (!dropzone || !fileInput) return;

  const uploadLibBtn = document.getElementById('upload-library');
  if (uploadLibBtn) uploadLibBtn.onclick = () => _showLibrary('uploaded');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) _handleUploadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) _handleUploadFile(fileInput.files[0]);
  });
}

function _handleUploadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const result = parseMapFile(text);

    const errorEl = document.getElementById('upload-error');
    const previewEl = document.getElementById('upload-preview');
    const actionsEl = document.getElementById('upload-actions');
    const dropzoneEl = document.getElementById('upload-dropzone');
    const verifyBtn = document.getElementById('upload-verify');
    const playBtn = document.getElementById('upload-play');
    const libraryBtn = document.getElementById('upload-library');

    if (result.error) {
      errorEl.innerHTML = `<span class="badge badge-red">${result.error}${result.line ? ` (linea ${result.line})` : ''}</span>`;
      previewEl.innerHTML = '';
      actionsEl.style.display = 'none';
    } else {
      errorEl.innerHTML = '';

      // Ocultar dropzone
      dropzoneEl.style.display = 'none';

      // Mostrar mapa grande
      _renderUploadPreview(result, previewEl);

      // Verificar si es duplicado
      const duplicate = _findDuplicateMap(result.grid);
      if (duplicate) {
        previewEl.innerHTML += `<div style="margin-top: 12px; text-align: center;"><span class="badge badge-yellow">⚠️ Este mapa ya existe en tu biblioteca</span></div>`;
      } else {
        // Auto-guardar en biblioteca si es nuevo
        const clues = extractClues(result.grid);
        const rows = result.grid.length;
        const cols = result.grid[0].length;
        const mapName = `${cols}×${rows} · ${clues.length}📍`;
        _saveCustomMap(result.grid, mapName, 'uploaded');
      }

      actionsEl.style.display = 'flex';
      playBtn.disabled = true;

      // Botón para volver a subir (el + rojo en el summary)
      const reuploadIconBtn = document.getElementById('upload-reupload-icon');
      if (reuploadIconBtn) {
        reuploadIconBtn.style.display = 'flex';
        reuploadIconBtn.onclick = (e) => {
          e.stopPropagation(); // evitar toggle del details
          previewEl.innerHTML = '';
          errorEl.innerHTML = '';
          dropzoneEl.style.display = 'flex';
          actionsEl.style.display = 'none';
          reuploadIconBtn.style.display = 'none';
          document.getElementById('upload-input').value = '';
        };
      }

      // Botón verificar
      verifyBtn.onclick = () => {
        _verifyUploadedMap(result.grid);
      };

      // Botón jugar
      playBtn.onclick = () => {
        state.activeDifficulty = null;
        state.activeLevel = null;
        // Recuperar ID del mapa guardado para poder guardar estrellas
        const existingMap = _findDuplicateMap(result.grid);
        state.activeCustomMapId = existingMap ? existingMap.id : null;
        _startGameWithGrid(result.grid);
      };

      // Botón biblioteca
      libraryBtn.onclick = () => {
        _showLibrary('uploaded');
      };
    }
  };
  reader.readAsText(file);
}

/**
 * Parsea archivo .txt con nuevo formato:
 * ANCHO ALTO
 * CANTIDAD_DE_PISTAS
 * FILA COL VALOR
 * ...
 */
function _showToast(msg) {
  let toast = document.getElementById('ui-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ui-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('toast-hide');
  toast.classList.add('toast-show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
  }, 2200);
}

export function parseMapFile(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 2) {
    return { error: 'El archivo debe tener al menos 2 lineas', line: 1 };
  }

  // Linea 1: ANCHO ALTO
  const header = lines[0].split(/\s+/).map(Number);
  if (header.length !== 2 || !Number.isInteger(header[0]) || !Number.isInteger(header[1])) {
    return { error: 'Linea 1 debe tener 2 enteros: ANCHO ALTO', line: 1 };
  }

  const [cols, rows] = header;
  if (rows < 4 || rows > 40 || cols < 4 || cols > 40) {
    return { error: 'Ancho y alto deben estar entre 4 y 40', line: 1 };
  }

  // Linea 2: cantidad de pistas
  const numClues = parseInt(lines[1]);
  if (!Number.isInteger(numClues) || numClues < 1) {
    return { error: 'Linea 2 debe ser la cantidad de pistas (entero >= 1)', line: 2 };
  }

  if (lines.length - 2 < numClues) {
    return { error: `Se esperaban ${numClues} pistas, se encontraron ${lines.length - 2}`, line: lines.length };
  }

  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < numClues; i++) {
    const parts = lines[i + 2].split(/\s+/).map(Number);
    if (parts.length !== 3) {
      return { error: `Linea ${i + 3}: se esperan 3 valores (FILA COLUMNA VALOR)`, line: i + 3 };
    }
    const [r, c, v] = parts;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !Number.isInteger(v)) {
      return { error: `Linea ${i + 3}: valores deben ser enteros`, line: i + 3 };
    }
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      return { error: `Linea ${i + 3}: posicion (${r},${c}) fuera del tablero ${cols}x${rows}`, line: i + 3 };
    }
    if (v < 1) {
      return { error: `Linea ${i + 3}: valor debe ser >= 1`, line: i + 3 };
    }
    grid[r][c] = v;
  }

  return { rows, cols, grid };
}

function _renderUploadPreview(mapData, container) {
  const { rows, cols, grid } = mapData;
  const isPC = window.innerWidth > 768;
  const maxSize = isPC ? Math.min(window.innerWidth * 0.55, 620) : 360;
  const cs = Math.min(Math.floor(maxSize / Math.max(rows, cols)), isPC ? 80 : 50);

  let html = '<div class="upload-preview-container">';
  html += '<div class="upload-preview-grid">';
  html += `<table class="preview-table" style="border-collapse:collapse">`;
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      const val = grid[r][c];
      const bgColor = val > 0 ? '#f0f0f0' : '#fafafa';
      html += `<td style="width:${cs}px;height:${cs}px;border:1px solid #ddd;text-align:center;font-size:${Math.max(11, cs*0.4)}px;font-weight:600;background:${bgColor};${val > 0 ? 'color:#333' : 'color:#eee'}">${val > 0 ? val : ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  html += '</div>';
  html += `<div class="upload-preview-info" style="margin-top: 12px; text-align: center; font-size: 13px; color: #666;">`;
  html += `${cols}×${rows} · ${extractClues(grid).length} pistas`;
  html += `</div>`;
  html += '</div>';
  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
// TAB EXPORTAR
// ══════════════════════════════════════════════════════════

function _bindExportEvents() {
  // Exportar todos (solo resueltos)
  const exportAllBtn = document.getElementById('export-all');
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => {
      const completed = _getCompletedLevels();
      let allTxt = '';
      for (const key of completed) {
        const [d, l] = key.split('-').map(Number);
        const grid = _loadPuzzle(d, l);
        if (!grid) continue;
        const config = DIFFICULTY_CONFIG[d - 1];
        allTxt += `# ${config.name} - Nivel ${l}\n`;
        allTxt += _gridToTxt(grid);
        allTxt += '\n';
      }
      if (allTxt) _downloadTxt('shikaku_niveles.txt', allTxt);
    });
  }

  // Exportar mapas resueltos individuales
  document.querySelectorAll('.export-single').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = parseInt(btn.dataset.diff);
      const l = parseInt(btn.dataset.level);
      const grid = _loadPuzzle(d, l);
      if (!grid) return;
      const config = DIFFICULTY_CONFIG[d - 1];
      const txt = _gridToTxt(grid);
      _downloadTxt(`shikaku_${config.name}_nivel${l}.txt`, txt);
    });
  });

  // Exportar mapas personalizados (creados o subidos)
  document.querySelectorAll('.export-custom').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const maps = _getCustomMaps();
      const map = maps.find(m => m.id === id);
      if (!map) return;
      const txt = _gridToTxt(map.grid);
      _downloadTxt(`shikaku_${map.name}.txt`, txt);
    });
  });
}

function _bindLibraryEvents() {
  const libraryBtn = document.getElementById('create-library');
  const libraryModal = document.getElementById('library-modal');
  const libraryClose = document.getElementById('library-close');

  if (libraryBtn) {
    libraryBtn.addEventListener('click', () => {
      _showLibrary('created');
    });
  }

  if (libraryClose) {
    libraryClose.addEventListener('click', () => {
      libraryModal.style.display = 'none';
    });
  }

  libraryModal?.addEventListener('click', (e) => {
    if (e.target === libraryModal) libraryModal.style.display = 'none';
  });
}

let _lastLibraryType = 'created';
function _showLibrary(type = 'created') {
  _lastLibraryType = type;
  const modal = document.getElementById('library-modal');
  const content = document.getElementById('library-content');
  const title = document.getElementById('library-title');
  const allMaps = _getCustomMaps();
  const maps = type === 'uploaded'
    ? allMaps.filter(m => m.type === 'uploaded')
    : allMaps.filter(m => m.type !== 'uploaded');

  if (title) title.textContent = type === 'uploaded' ? '🗺️ Mapas subidos' : '🗺️ Mapas creados';

  const emptyMsg = type === 'uploaded'
    ? '<p style="font-size: 16px; margin: 0;">📂 No has subido mapas aún</p><p style="font-size: 13px; margin-top: 8px;">¡Sube un .txt para empezar!</p>'
    : '<p style="font-size: 16px; margin: 0;">📦 No has creado mapas aún</p><p style="font-size: 13px; margin-top: 8px;">¡Diseña uno para empezar!</p>';

  if (maps.length === 0) {
    content.innerHTML = `<div style="text-align: center; padding: 40px 20px; color: #999;">${emptyMsg}</div>`;
  } else {
    content.innerHTML = maps.map(map => `
      <div class="library-item" style="display: flex; gap: 12px; padding: 14px; border: 1px solid #e0e0e0; border-radius: 10px; margin-bottom: 8px; align-items: center;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${map.name}</div>
          <div style="font-size: 12px; color: #888; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>${map.clues} pistas · ${new Date(map.date).toLocaleDateString()}</span>
            ${map.stars != null ? `<span style="display:inline-flex;align-items:center;gap:2px;">${_renderStarsHTML(map.stars, 13)}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window._loadMapFromLibrary(${map.id})" style="white-space: nowrap;">▶ Jugar</button>
        <button class="btn btn-secondary btn-sm" onclick="window._deleteMapFromLibrary(${map.id})" style="white-space: nowrap;">🗑</button>
      </div>
    `).join('');
  }

  modal.style.display = 'flex';
}

window._loadMapFromLibrary = function(id) {
  const maps = _getCustomMaps();
  const map = maps.find(m => m.id === id);
  if (map) {
    document.getElementById('library-modal').style.display = 'none';
    state.activeDifficulty = null;
    state.activeLevel = null;
    state.activeCustomMapId = id;
    _startGameWithGrid(map.grid);
  }
};

window._deleteMapFromLibrary = function(id) {
  _showConfirm('¿Seguro que deseas eliminar este mapa?', () => {
    _deleteCustomMap(id);
    _showLibrary(_lastLibraryType);
  });
};

// ══════════════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════════════

function _showLoadingOverlay(text) {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="loading-content"><span class="spinner-large"></span><p>${text}</p></div>`;
  overlay.style.display = 'flex';
}

function _hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _saveGameState() {
  if (!state.activeBoard || !state.currentGrid) return;
  try {
    sessionStorage.setItem('shikaku_game_state', JSON.stringify({
      grid: state.currentGrid,
      difficulty: state.activeDifficulty,
      level: state.activeLevel,
      timerSeconds: state.timerSeconds,
      boardState: state.activeBoard.getState()
    }));
  } catch { }
}

function _tryRestoreGameState() {
  try {
    const saved = sessionStorage.getItem('shikaku_game_state');
    if (!saved) return;
    const data = JSON.parse(saved);
    if (JSON.stringify(data.grid) === JSON.stringify(state.currentGrid)) {
      state.timerSeconds = data.timerSeconds || 0;
      const display = document.getElementById('timer-display');
      if (display) display.textContent = _formatTime(state.timerSeconds);
      if (state.activeBoard && data.boardState) state.activeBoard.restoreState(data.boardState);
    }
    sessionStorage.removeItem('shikaku_game_state');
  } catch { }
}

