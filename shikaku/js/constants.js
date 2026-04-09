/**
 * @file constants.js
 * @description Colores, tamaños y configuración global del juego Shikaku.
 */

/** Configuración de dificultades con rangos de tamaño y colores */
export const DIFFICULTY_CONFIG = [
  { id: 1, name: 'Principiante', minR: 4,  maxR: 5,  color: '#C0DD97', textColor: '#27500A', darkColor: '#4a7a1e' },
  { id: 2, name: 'Fácil',        minR: 6,  maxR: 8,  color: '#9FE1CB', textColor: '#085041', darkColor: '#0a6b56' },
  { id: 3, name: 'Medio',        minR: 9,  maxR: 14, color: '#FAC775', textColor: '#633806', darkColor: '#7a4508' },
  { id: 4, name: 'Difícil',      minR: 15, maxR: 25, color: '#F0997B', textColor: '#712B13', darkColor: '#8a3518' },
  { id: 5, name: 'Experto',      minR: 26, maxR: 40, color: '#ED93B1', textColor: '#4B1528', darkColor: '#5e1a32' }
];

/** 40 colores vibrantes para regiones, con buena separación perceptual */
export const REGION_COLORS = [
  '#7C9CED', '#5DCAA5', '#F2A74B', '#E87DA0', '#6DC8E0',
  '#A3D468', '#E8845E', '#C490E0', '#4DB8A0', '#F0C75A',
  '#7B8FD4', '#E06B8F', '#58B5CC', '#D4A03E', '#8FC45E',
  '#D477C8', '#5AAD8E', '#E89A4A', '#8E7ED4', '#6BC870',
  '#E0756E', '#4CAED0', '#C8B84A', '#A07ADB', '#56C09A',
  '#E88A6A', '#6A9DE8', '#D0A050', '#8DB558', '#D878A0',
  '#4ABCC0', '#E0984E', '#7A88E0', '#5EC87A', '#D08070',
  '#50B0D8', '#C4C050', '#9878D0', '#60BCA0', '#E8A878'
];

/** Colores de texto oscuro para cada color de región (contraste WCAG AA) */
export const REGION_TEXT_COLORS = [
  '#1a2a5c', '#0a4a38', '#5a3000', '#5a1030', '#0a4050',
  '#2a4a10', '#5a2010', '#3a1a50', '#0a4038', '#4a3800',
  '#1a2050', '#501028', '#0a3848', '#4a3000', '#2a4010',
  '#401050', '#0a3828', '#502800', '#281a50', '#1a4820',
  '#501818', '#083848', '#484000', '#2a1850', '#0a4030',
  '#502010', '#1a2858', '#483000', '#284010', '#481030',
  '#084040', '#502800', '#1a1850', '#104820', '#481818',
  '#083848', '#404000', '#201040', '#104030', '#503018'
];

/** Configuración del solver */
export const SOLVER_CONFIG = {
  maxSolutions: Infinity,
  timeoutMs: 15000,
  workerTimeoutMs: 600000,
  progressEvery: 50000,
};

/** Límites de tamaño de celda en píxeles */
export const CELL_SIZE_LIMITS = {
  min: 6,
  max: 80,
};

/** Número de niveles por dificultad */
export const LEVELS_PER_DIFFICULTY = 10;

/** Íconos SVG inline */
export const ICONS = {
  BACK: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`,

  RESTART: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,

  HINT: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 4 12.7V17H8v-2.3A7 7 0 0 1 12 2z"/></svg>`,

  PLAY: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,

  PAUSE: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,

  PREV: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 18l-6-6 6-6"/></svg>`,

  NEXT: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 6l6 6-6 6"/></svg>`,

  FIRST: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17 18l-6-6 6-6"/><rect x="5" y="6" width="2" height="12"/></svg>`,

  LAST: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 6l6 6-6 6"/><rect x="17" y="6" width="2" height="12"/></svg>`,

  PUZZLE: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3a2 2 0 0 0 2-2 2 2 0 0 1 4 0 2 2 0 0 0 2 2h3v3a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2v3H4V7z"/></svg>`,

  PENCIL: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,

  UPLOAD: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg>`,

  CLOSE: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,

  SPINNER: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10" class="spinner-path"/></svg>`,

  SOLVE: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0H5a2 2 0 0 1-2-2v-4m6 6h10a2 2 0 0 0 2-2v-4"/></svg>`,

  TROPHY: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M6 3h12v6a6 6 0 0 1-12 0V3z"/><path d="M12 15v3"/><path d="M8 21h8"/><path d="M8 21v-3h8v3"/></svg>`,

  ZOOM_RESET: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>`,
};
