/**
 * @file board.js
 * @description Renderizado del tablero, interacción del jugador, zoom/pan.
 * Utiliza canvas doble (fondo + overlay) para rendimiento.
 */

import { REGION_COLORS, REGION_TEXT_COLORS, CELL_SIZE_LIMITS } from './constants.js?v=3';

/**
 * Clase principal del tablero de juego
 */
export class Board {
  /**
   * @param {HTMLElement} container - Contenedor del tablero
   * @param {number[][]} grid - Grilla del puzzle
   * @param {Array<Object>} clues - Lista de pistas
   * @param {Object} options - Opciones adicionales
   */
  constructor(container, grid, clues, options = {}) {
    this.container = container;
    this.grid = grid;
    this.clues = clues;
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.onVictory = options.onVictory || null;
    this.readOnly = options.readOnly || false;

    /** Regiones asignadas por el jugador: mapa de clueIndex → rect {r0,c0,w,h} */
    this.playerRegions = new Map();

    /** Mapa de ocupación del jugador: [r][c] = clueIndex o -1 */
    this.occupationMap = Array.from({ length: this.rows },
      () => new Array(this.cols).fill(-1));

    /** Colores asignados a cada pista */
    this.clueColors = this._assignColors();

    /** Estado del arrastre */
    this.dragState = null;

    /** Estado de zoom/pan */
    this.zoom = { scale: 1.0, offsetX: 0, offsetY: 0 };
    this.zoomEnabled = false;
    this.touchState = null;

    /** Canvas principales */
    this.canvas = null;
    this.overlay = null;
    this.ctx = null;
    this.octx = null;
    this.cellSize = 0;
    this.dpr = window.devicePixelRatio || 1;

    /** Animaciones activas */
    this.animations = [];
    this.animFrame = null;

    /** Solución para paso a paso */
    this.solutionSteps = null;
    this.currentStep = 0;

    this._init();
  }

  /**
   * Inicializa canvas y calcula tamaños
   */
  _init() {
    this.container.innerHTML = '';
    this.container.style.position = 'relative';

    this._calcSize();
    this._createCanvases();
    this._bindEvents();
    this.render();
  }

  /**
   * Calcula el tamaño de celda según el espacio disponible
   */
  _calcSize() {
    const headerEl = document.querySelector('#game-header');
    const statsEl = document.querySelector('#stats-bar');
    const stepEl = document.querySelector('#step-bar');

    const headerH = headerEl ? headerEl.offsetHeight : 52;
    const statsH = statsEl ? statsEl.offsetHeight : 0;
    const stepH = stepEl ? stepEl.offsetHeight : 0;

    const available = Math.min(
      window.innerWidth - 24,
      window.innerHeight - headerH - statsH - stepH - 24
    );

    this.cellSize = Math.floor(available / Math.max(this.rows, this.cols));
    this.cellSize = Math.max(CELL_SIZE_LIMITS.min, Math.min(this.cellSize, CELL_SIZE_LIMITS.max));

    // Activar zoom si las celdas son muy pequeñas
    this.zoomEnabled = this.cellSize < 14;
  }

  /**
   * Crea los elementos canvas
   */
  _createCanvases() {
    const w = this.cols * this.cellSize;
    const h = this.rows * this.cellSize;

    // Contenedor con scroll/zoom
    this.boardWrapper = document.createElement('div');
    this.boardWrapper.className = 'board-wrapper';
    this.boardWrapper.style.width = w + 'px';
    this.boardWrapper.style.height = h + 'px';
    this.boardWrapper.style.position = 'relative';
    this.boardWrapper.style.touchAction = 'none';

    // Canvas principal
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.dpr, this.dpr);

    // Canvas overlay
    this.overlay = document.createElement('canvas');
    this.overlay.width = w * this.dpr;
    this.overlay.height = h * this.dpr;
    this.overlay.style.width = w + 'px';
    this.overlay.style.height = h + 'px';
    this.overlay.style.position = 'absolute';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.octx = this.overlay.getContext('2d');
    this.octx.scale(this.dpr, this.dpr);

    this.boardWrapper.appendChild(this.canvas);
    this.boardWrapper.appendChild(this.overlay);
    this.container.appendChild(this.boardWrapper);

    // Mini-mapa si zoom habilitado
    if (this.zoomEnabled) {
      this._createMinimap();
    }
  }

  /**
   * Genera n colores únicos para rectángulos.
   * Si n ≤ paleta: baraja la paleta y devuelve los primeros n (todos distintos).
   * Si n > paleta: genera colores HSL con tono equiespaciado (todos únicos).
   * @param {number} n
   * @returns {Array<{bg: string, text: string}>}
   */
  _generateColors(n) {
    const nPalette = REGION_COLORS.length;
    if (n <= nPalette) {
      const indices = Array.from({ length: nPalette }, (_, i) => i);
      for (let i = nPalette - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      return indices.slice(0, n).map(ci => ({
        bg: REGION_COLORS[ci],
        text: REGION_TEXT_COLORS[ci]
      }));
    }
    // Más rectángulos que la paleta fija: HSL equiespaciado, todos únicos
    return Array.from({ length: n }, (_, i) => {
      const hue = Math.round((i * 360) / n) % 360;
      const sat = 55 + (i % 3) * 8;    // 55 / 63 / 71
      const light = 58 + (i % 2) * 8;  // 58 / 66
      return {
        bg: `hsl(${hue}, ${sat}%, ${light}%)`,
        text: `hsl(${hue}, 55%, 18%)`
      };
    });
  }

  /**
   * Asigna un color único a cada pista.
   * @returns {Map<number, {bg: string, text: string}>}
   */
  _assignColors() {
    const colorMap = new Map();
    const colors = this._generateColors(this.clues.length);
    this.clues.forEach((clue, i) => {
      colorMap.set(i, colors[i]);
    });
    return colorMap;
  }

  /**
   * Re-asigna un color único a cada rectángulo de la solución.
   * @param {Array} solution - Solución del solver
   */
  recolorWithSolution(solution) {
    if (!solution || solution.length === 0) return;
    const colors = this._generateColors(solution.length);
    for (let i = 0; i < solution.length; i++) {
      this.clueColors.set(i, colors[i]);
    }
  }

  /**
   * Bloquea el tablero: impide toda interacción del jugador.
   */
  lock() {
    this.readOnly = true;
    if (this.overlay) this.overlay.style.pointerEvents = 'none';
  }

  /**
   * Bindea eventos de ratón y táctiles
   */
  _bindEvents() {
    if (this.readOnly) return;

    const ov = this.overlay;

    // Ratón
    ov.addEventListener('mousedown', (e) => this._onPointerDown(e));
    ov.addEventListener('mousemove', (e) => this._onPointerMove(e));
    ov.addEventListener('mouseup', (e) => this._onPointerUp(e));
    ov.addEventListener('mouseleave', () => this._cancelDrag());

    // Clic derecho para desmarcar
    ov.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.readOnly) return;
      const pos = this._eventToCell(e);
      if (pos) this._removeRegionAt(pos.row, pos.col);
    });

    // Doble clic para desmarcar
    ov.addEventListener('dblclick', (e) => {
      if (this.readOnly) return;
      const pos = this._eventToCell(e);
      if (pos) this._removeRegionAt(pos.row, pos.col);
    });

    // Touch
    ov.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    ov.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    ov.addEventListener('touchend', (e) => this._onTouchEnd(e));

    // Redimensionamiento
    this._resizeHandler = () => {
      this._calcSize();
      const w = this.cols * this.cellSize;
      const h = this.rows * this.cellSize;
      this.boardWrapper.style.width = w + 'px';
      this.boardWrapper.style.height = h + 'px';
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.overlay.width = w * this.dpr;
      this.overlay.height = h * this.dpr;
      this.overlay.style.width = w + 'px';
      this.overlay.style.height = h + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.render();
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Convierte evento a coordenadas de celda
   * @param {MouseEvent|Touch} e
   * @returns {{row: number, col: number}|null}
   */
  _eventToCell(e) {
    const rect = this.overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoom.scale - this.zoom.offsetX;
    const y = (e.clientY - rect.top) / this.zoom.scale - this.zoom.offsetY;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return { row, col };
  }

  /**
   * Inicio del arrastre
   */
  _onPointerDown(e) {
    if (this.readOnly) return;
    if (e.button !== 0) return;
    const pos = this._eventToCell(e);
    if (!pos) return;
    this.dragState = {
      startRow: pos.row, startCol: pos.col,
      currentRow: pos.row, currentCol: pos.col
    };
  }

  /**
   * Movimiento durante arrastre
   */
  _onPointerMove(e) {
    if (!this.dragState) return;
    const pos = this._eventToCell(e);
    if (!pos) return;
    this.dragState.currentRow = pos.row;
    this.dragState.currentCol = pos.col;
    this._renderOverlay();
  }

  /**
   * Fin del arrastre
   */
  _onPointerUp(e) {
    if (!this.dragState) return;
    const pos = this._eventToCell(e);
    if (pos) {
      this.dragState.currentRow = pos.row;
      this.dragState.currentCol = pos.col;
    }
    this._tryPlaceRegion();
    this.dragState = null;
    this._clearOverlay();
  }

  /**
   * Cancela arrastre activo
   */
  _cancelDrag() {
    this.dragState = null;
    this._clearOverlay();
  }

  /** Manejo táctil */
  _onTouchStart(e) {
    if (this.readOnly) return;
    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const pos = this._eventToCell(touch);
      if (!pos) return;

      if (this.touchState && this.touchState.phase === 'waitEnd') {
        // Segundo tap: completar selección
        this.dragState = {
          startRow: this.touchState.startRow,
          startCol: this.touchState.startCol,
          currentRow: pos.row,
          currentCol: pos.col
        };
        this._tryPlaceRegion();
        this.dragState = null;
        this.touchState = null;
        this._clearOverlay();
        return;
      }

      // Primer tap o inicio de arrastre
      this.dragState = {
        startRow: pos.row, startCol: pos.col,
        currentRow: pos.row, currentCol: pos.col
      };
      this.touchState = {
        phase: 'dragging',
        startRow: pos.row, startCol: pos.col,
        moved: false
      };
    } else if (e.touches.length === 2 && this.zoomEnabled) {
      e.preventDefault();
      this._cancelDrag();
      const d = this._touchDistance(e.touches);
      this.touchState = {
        phase: 'pinch',
        initialDist: d,
        initialScale: this.zoom.scale,
        centerX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        centerY: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && this.touchState?.phase === 'dragging') {
      const touch = e.touches[0];
      const pos = this._eventToCell(touch);
      if (!pos) return;
      this.touchState.moved = true;
      if (this.dragState) {
        this.dragState.currentRow = pos.row;
        this.dragState.currentCol = pos.col;
        this._renderOverlay();
      }
    } else if (e.touches.length === 2 && this.touchState?.phase === 'pinch') {
      const d = this._touchDistance(e.touches);
      const newScale = Math.max(0.5, Math.min(5.0,
        this.touchState.initialScale * (d / this.touchState.initialDist)));
      this.zoom.scale = newScale;
      this._applyZoom();
    }
  }

  _onTouchEnd(e) {
    if (this.touchState?.phase === 'dragging') {
      if (this.touchState.moved && this.dragState) {
        // Fin de arrastre táctil
        this._tryPlaceRegion();
        this.dragState = null;
        this.touchState = null;
        this._clearOverlay();
      } else {
        // Tap sin movimiento: esperar segundo tap o timeout
        this.dragState = null;
        this.touchState = {
          phase: 'waitEnd',
          startRow: this.touchState.startRow,
          startCol: this.touchState.startCol
        };
        // Mostrar selección del inicio
        this._renderTapStart(this.touchState.startRow, this.touchState.startCol);
        // Timeout: si no hay segundo tap en 3s, cancelar
        clearTimeout(this._tapTimeout);
        this._tapTimeout = setTimeout(() => {
          this.touchState = null;
          this._clearOverlay();
        }, 3000);
      }
    } else if (this.touchState?.phase === 'pinch') {
      this.touchState = null;
    }
  }

  _touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _applyZoom() {
    this.boardWrapper.style.transform =
      `scale(${this.zoom.scale}) translate(${this.zoom.offsetX}px, ${this.zoom.offsetY}px)`;
    this.boardWrapper.style.transformOrigin = 'top left';
    if (this.minimap) this._renderMinimap();
  }

  /**
   * Intenta colocar una región basada en el arrastre actual
   */
  _tryPlaceRegion() {
    if (!this.dragState) return;
    const { startRow, startCol, currentRow, currentCol } = this.dragState;

    const r0 = Math.min(startRow, currentRow);
    const c0 = Math.min(startCol, currentCol);
    const r1 = Math.max(startRow, currentRow);
    const c1 = Math.max(startCol, currentCol);
    const w = c1 - c0 + 1;
    const h = r1 - r0 + 1;
    const area = w * h;

    // Buscar pista contenida en este rectángulo
    let clueIdx = -1;
    let clueCount = 0;
    for (let i = 0; i < this.clues.length; i++) {
      const cl = this.clues[i];
      if (cl.row >= r0 && cl.row <= r1 && cl.col >= c0 && cl.col <= c1) {
        // Verificar que la pista no está ya asignada a otra región
        if (!this.playerRegions.has(i)) {
          clueIdx = i;
          clueCount++;
        }
      }
    }

    // Validar: exactamente una pista, y su valor coincide con el área
    if (clueCount !== 1 || this.clues[clueIdx].value !== area) {
      this._shakeAnimation(r0, c0, w, h);
      return;
    }

    // Verificar que las celdas no están ocupadas por otra región
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.occupationMap[r][c] !== -1) {
          this._shakeAnimation(r0, c0, w, h);
          return;
        }
      }
    }

    // ¡Válido! Asignar región
    this.playerRegions.set(clueIdx, { r0, c0, w, h });
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        this.occupationMap[r][c] = clueIdx;
      }
    }

    this._animateRegionAppear(clueIdx, { r0, c0, w, h });
    this.render();
    this._checkVictory();
  }

  /**
   * Elimina una región en la posición dada
   */
  _removeRegionAt(row, col) {
    const clueIdx = this.occupationMap[row][col];
    if (clueIdx === -1) return;

    const rect = this.playerRegions.get(clueIdx);
    if (!rect) return;

    // Limpiar ocupación
    for (let r = rect.r0; r < rect.r0 + rect.h; r++) {
      for (let c = rect.c0; c < rect.c0 + rect.w; c++) {
        this.occupationMap[r][c] = -1;
      }
    }
    this.playerRegions.delete(clueIdx);
    this.render();
  }

  /**
   * Verifica si el jugador completó el puzzle
   */
  _checkVictory() {
    if (this.playerRegions.size !== this.clues.length) return;

    // Verificar que todo el tablero está cubierto
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.occupationMap[r][c] === -1) return;
      }
    }

    // ¡Victoria!
    this._playVictoryAnimation();
    if (this.onVictory) this.onVictory();
  }

  /**
   * Renderiza el tablero completo
   */
  render() {
    const ctx = this.ctx;
    const cs = this.cellSize;

    ctx.clearRect(0, 0, this.cols * cs, this.rows * cs);

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.cols * cs, this.rows * cs);

    // Regiones coloreadas
    for (const [clueIdx, rect] of this.playerRegions) {
      const colors = this.clueColors.get(clueIdx);
      if (!colors) continue;
      ctx.fillStyle = colors.bg;
      ctx.fillRect(rect.c0 * cs, rect.r0 * cs, rect.w * cs, rect.h * cs);

      // Borde de la región
      ctx.strokeStyle = this._darkenColor(colors.bg, 0.3);
      ctx.lineWidth = 2.5;
      this._roundRect(ctx, rect.c0 * cs + 1, rect.r0 * cs + 1,
        rect.w * cs - 2, rect.h * cs - 2, 3);
      ctx.stroke();
    }

    // Líneas de grilla
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let r = 0; r <= this.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cs);
      ctx.lineTo(this.cols * cs, r * cs);
      ctx.stroke();
    }
    for (let c = 0; c <= this.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cs, 0);
      ctx.lineTo(c * cs, this.rows * cs);
      ctx.stroke();
    }

    // Números de pistas
    const fontSize = Math.max(10, Math.min(cs * 0.45, 28));
    const showNumbers = cs >= 12;

    if (showNumbers) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

      for (let i = 0; i < this.clues.length; i++) {
        const cl = this.clues[i];
        const colors = this.clueColors.get(i);

        if (this.playerRegions.has(i)) {
          ctx.fillStyle = colors ? colors.text : '#333';
        } else {
          ctx.fillStyle = '#333';
        }

        ctx.fillText(
          cl.value.toString(),
          cl.col * cs + cs / 2,
          cl.row * cs + cs / 2
        );
      }
    }

    // Borde exterior del tablero
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.cols * cs, this.rows * cs);
  }

  /**
   * Renderiza overlay durante arrastre
   */
  _renderOverlay() {
    this._clearOverlay();
    if (!this.dragState) return;

    const { startRow, startCol, currentRow, currentCol } = this.dragState;
    const r0 = Math.min(startRow, currentRow);
    const c0 = Math.min(startCol, currentCol);
    const r1 = Math.max(startRow, currentRow);
    const c1 = Math.max(startCol, currentCol);
    const w = c1 - c0 + 1;
    const h = r1 - r0 + 1;
    const area = w * h;
    const cs = this.cellSize;

    // Determinar si es válido
    let valid = false;
    for (let i = 0; i < this.clues.length; i++) {
      const cl = this.clues[i];
      if (cl.row >= r0 && cl.row <= r1 && cl.col >= c0 && cl.col <= c1) {
        if (!this.playerRegions.has(i) && cl.value === area) {
          // Verificar celdas no ocupadas
          let cellsFree = true;
          for (let rr = r0; rr <= r1 && cellsFree; rr++) {
            for (let cc = c0; cc <= c1 && cellsFree; cc++) {
              if (this.occupationMap[rr][cc] !== -1) cellsFree = false;
            }
          }
          if (cellsFree) valid = true;
        }
      }
    }

    const octx = this.octx;
    octx.fillStyle = valid ? 'rgba(76, 175, 80, 0.35)' : 'rgba(244, 67, 54, 0.35)';
    octx.fillRect(c0 * cs, r0 * cs, w * cs, h * cs);

    octx.strokeStyle = valid ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)';
    octx.lineWidth = 2;
    octx.strokeRect(c0 * cs, r0 * cs, w * cs, h * cs);

    // Mostrar área
    const fontSize = Math.max(12, Math.min(cs * 0.6, 24));
    octx.font = `600 ${fontSize}px system-ui`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = valid ? 'rgba(46, 125, 50, 0.9)' : 'rgba(198, 40, 40, 0.9)';
    octx.fillText(area.toString(), (c0 + w / 2) * cs, (r0 + h / 2) * cs);
  }

  /**
   * Muestra indicador del primer tap (modo táctil)
   */
  _renderTapStart(row, col) {
    const cs = this.cellSize;
    const octx = this.octx;
    this._clearOverlay();
    octx.fillStyle = 'rgba(33, 150, 243, 0.4)';
    octx.fillRect(col * cs, row * cs, cs, cs);
    octx.strokeStyle = 'rgba(33, 150, 243, 0.8)';
    octx.lineWidth = 2;
    octx.strokeRect(col * cs, row * cs, cs, cs);
  }

  /**
   * Limpia el canvas overlay
   */
  _clearOverlay() {
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /**
   * Animación de aparición de región
   */
  _animateRegionAppear(clueIdx, rect) {
    // La animación se maneja visualmente con CSS en el render
    // Aquí simplemente refrescamos
    this.render();
  }

  /**
   * Animación de shake para movimiento inválido
   */
  _shakeAnimation(r0, c0, w, h) {
    const cs = this.cellSize;
    let frame = 0;
    const octx = this.octx;
    const animate = () => {
      this._clearOverlay();
      const offX = Math.sin(frame * 1.5) * 6 * (1 - frame / 12);
      octx.fillStyle = 'rgba(244, 67, 54, 0.3)';
      octx.fillRect(c0 * cs + offX, r0 * cs, w * cs, h * cs);
      frame++;
      if (frame < 12) {
        requestAnimationFrame(animate);
      } else {
        this._clearOverlay();
      }
    };
    animate();
  }

  /**
   * Animación de victoria (ola de brillo)
   */
  _playVictoryAnimation() {
    const cs = this.cellSize;
    let col = 0;
    const interval = setInterval(() => {
      if (col >= this.cols) {
        clearInterval(interval);
        return;
      }
      // Dibujar columna con brillo
      const ctx = this.octx;
      ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
      ctx.fillRect(col * cs, 0, cs, this.rows * cs);
      // Desvanecer después
      setTimeout(() => {
        ctx.clearRect(col * cs, 0, cs, this.rows * cs);
      }, 300);
      col++;
    }, 30);
  }

  /**
   * Muestra pista visual: resalta la región con menos opciones
   * @param {Array} clueOptions - Lista de opciones por pista del solver
   */
  showHint(clueOptions) {
    // Encontrar pista sin asignar con menos opciones
    let bestIdx = -1;
    let bestCount = Infinity;

    for (let i = 0; i < this.clues.length; i++) {
      if (this.playerRegions.has(i)) continue;
      const count = clueOptions ? clueOptions[i] : (i + 1);
      if (count < bestCount) {
        bestCount = count;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return;

    const cl = this.clues[bestIdx];
    const cs = this.cellSize;
    const octx = this.octx;

    // Animación de pulso durante 2.5s
    let frame = 0;
    const totalFrames = 150; // ~2.5s a 60fps
    const animate = () => {
      if (frame >= totalFrames) {
        this._clearOverlay();
        return;
      }
      this._clearOverlay();
      const pulse = Math.sin(frame * 0.15) * 0.5 + 0.5;
      const radius = pulse * 12;
      octx.shadowColor = 'rgba(255, 200, 0, 0.7)';
      octx.shadowBlur = radius;
      octx.fillStyle = `rgba(255, 200, 0, ${0.3 + pulse * 0.3})`;
      octx.fillRect(cl.col * cs - 2, cl.row * cs - 2, cs + 4, cs + 4);
      octx.shadowBlur = 0;
      frame++;
      requestAnimationFrame(animate);
    };
    animate();
  }

  /**
   * Muestra pulso visual en una pista recién resuelta por hint
   * @param {number} clueIdx - Índice de la pista
   */
  showHintPulse(clueIdx) {
    const rect = this.playerRegions.get(clueIdx);
    if (!rect) return;
    const cs = this.cellSize;
    const octx = this.octx;

    let frame = 0;
    const totalFrames = 90;
    const animate = () => {
      if (frame >= totalFrames) {
        this._clearOverlay();
        return;
      }
      this._clearOverlay();
      const pulse = Math.sin(frame * 0.2) * 0.5 + 0.5;
      octx.fillStyle = `rgba(255, 220, 50, ${0.15 + pulse * 0.25})`;
      octx.fillRect(rect.c0 * cs, rect.r0 * cs, rect.w * cs, rect.h * cs);
      octx.strokeStyle = `rgba(255, 180, 0, ${0.5 + pulse * 0.5})`;
      octx.lineWidth = 3;
      octx.strokeRect(rect.c0 * cs + 1, rect.r0 * cs + 1, rect.w * cs - 2, rect.h * cs - 2);
      frame++;
      requestAnimationFrame(animate);
    };
    animate();
  }

  /**
   * Muestra una solución paso a paso
   * @param {Array} solution - Array de {clue, rect}
   * @param {number} step - Paso actual (0 = vacío, N = paso N)
   */
  showSolutionStep(solution, step) {
    // Limpiar todo
    this.playerRegions.clear();
    this.occupationMap = Array.from({ length: this.rows },
      () => new Array(this.cols).fill(-1));

    // Aplicar pasos hasta el actual
    for (let i = 0; i < Math.min(step, solution.length); i++) {
      const s = solution[i];
      const clueIdx = this.clues.findIndex(
        cl => cl.row === s.clue.row && cl.col === s.clue.col
      );
      if (clueIdx >= 0) {
        this.playerRegions.set(clueIdx, s.rect);
        for (let r = s.rect.r0; r < s.rect.r0 + s.rect.h; r++) {
          for (let c = s.rect.c0; c < s.rect.c0 + s.rect.w; c++) {
            this.occupationMap[r][c] = clueIdx;
          }
        }
      }
    }

    this.render();
  }

  /**
   * Reinicia el tablero
   */
  reset() {
    this.playerRegions.clear();
    this.occupationMap = Array.from({ length: this.rows },
      () => new Array(this.cols).fill(-1));
    this._clearOverlay();
    this.render();
  }

  /**
   * Crea mini-mapa para zoom
   */
  _createMinimap() {
    const mm = document.createElement('div');
    mm.className = 'minimap-container';
    mm.innerHTML = `
      <canvas class="minimap-canvas" width="120" height="120"></canvas>
      <button class="minimap-reset" title="Resetear zoom">&#x2B1C;</button>
    `;
    this.container.appendChild(mm);
    this.minimap = mm.querySelector('.minimap-canvas');
    mm.querySelector('.minimap-reset').addEventListener('click', () => {
      this.zoom = { scale: 1.0, offsetX: 0, offsetY: 0 };
      this._applyZoom();
    });
  }

  _renderMinimap() {
    if (!this.minimap) return;
    const ctx = this.minimap.getContext('2d');
    const mw = 120, mh = 120;
    ctx.clearRect(0, 0, mw, mh);

    const scaleX = mw / (this.cols * this.cellSize);
    const scaleY = mh / (this.rows * this.cellSize);
    const s = Math.min(scaleX, scaleY);

    ctx.save();
    ctx.scale(s, s);
    // Dibujar tablero simplificado
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, this.cols * this.cellSize, this.rows * this.cellSize);

    for (const [clueIdx, rect] of this.playerRegions) {
      const colors = this.clueColors.get(clueIdx);
      if (colors) {
        ctx.fillStyle = colors.bg;
        ctx.fillRect(rect.c0 * this.cellSize, rect.r0 * this.cellSize,
          rect.w * this.cellSize, rect.h * this.cellSize);
      }
    }
    ctx.restore();

    // Rectángulo de vista actual
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    const viewW = window.innerWidth / this.zoom.scale * s;
    const viewH = window.innerHeight / this.zoom.scale * s;
    ctx.strokeRect(-this.zoom.offsetX * s, -this.zoom.offsetY * s, viewW, viewH);
  }

  /**
   * Dibuja rectángulo con esquinas redondeadas
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Oscurece un color hex
   */
  _darkenColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.max(0, Math.round(r * (1 - amount)));
    const ng = Math.max(0, Math.round(g * (1 - amount)));
    const nb = Math.max(0, Math.round(b * (1 - amount)));
    return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
  }

  /**
   * Obtiene el estado actual para guardar en sessionStorage
   */
  getState() {
    return {
      playerRegions: Array.from(this.playerRegions.entries()),
      occupationMap: this.occupationMap.map(row => [...row])
    };
  }

  /**
   * Restaura estado desde sessionStorage
   */
  restoreState(state) {
    if (!state) return;
    this.playerRegions = new Map(state.playerRegions);
    this.occupationMap = state.occupationMap.map(row => [...row]);
    this.render();
  }

  /**
   * Limpia recursos
   */
  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    clearTimeout(this._tapTimeout);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}
