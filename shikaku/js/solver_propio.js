/**
 * @file solver_propio.js
 *
 * Algoritmo propio para resolver Shikaku.
 *
 * Lo fuimos construyendo después de analizar muchos puzzles en papel.
 * La pregunta que nos guió fue: "¿Cómo lo resolvería un humano?"
 *
 * Notamos que un humano hace esto:
 *   1. Primero busca los números que tienen MENOS opciones posibles.
 *   2. Los asigna y ve si eso obliga a otros a asignarse solos.
 *   3. Para los que quedan, prueba opciones guardando lo que ya decidió.
 *
 * De ahí salió la estrategia:
 *   FASE 1 → Calcular todos los rectángulos posibles para cada número.
 *   FASE 2 → Aplicar reglas para eliminar los que son imposibles.
 *   FASE 3 → Asignar los forzados en cadena (efecto dominó).
 *   FASE 4 → Para los que quedan, buscar con una tabla DP paso a paso.
 */

// ═══════════════════════════════════════════════════════════
// BLOQUE 1 — HERRAMIENTAS BÁSICAS
// Lo primero que necesitamos: saber de qué formas se puede
// armar un rectángulo con un área dada.
// ═══════════════════════════════════════════════════════════

/**
 * Devuelve todos los pares (ancho, alto) cuyo producto sea igual a n.
 * Ejemplo: n=6 → [{a:1,h:6},{a:2,h:3},{a:3,h:2},{a:6,h:1}]
 */
function obtenerFormas(n) {
  const formas = [];
  for (let ancho = 1; ancho <= n; ancho++) {
    if (n % ancho === 0) {
      formas.push({ ancho, alto: n / ancho });
    }
  }
  return formas;
}

/**
 * ¿El número es primo?
 * Si es primo, sus únicos factores son 1 y él mismo.
 * Eso significa que el rectángulo SOLO puede ser una línea.
 *   → 2: solo 1×2 o 2×1
 *   → 5: solo 1×5 o 5×1
 *   → 7: solo 1×7 o 7×1
 */
function esPrimo(n) {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/**
 * ¿El número es cuadrado perfecto?
 * Estos pueden formar un cuadrado (4→2×2, 9→3×3, 16→4×4...).
 * Son importantes porque el cuadrado suele ser la opción natural
 * cuando la pista está en el centro del tablero.
 */
function esCuadradoPerfecto(n) {
  const raiz = Math.sqrt(n);
  return Number.isInteger(raiz);
}

/**
 * Dadas las celdas de un rectángulo, devuelve un Set con las claves
 * "fila,col" para comparación rápida.
 */
function celdasDelRect(r0, c0, ancho, alto) {
  const celdas = new Set();
  for (let r = r0; r < r0 + alto; r++) {
    for (let c = c0; c < c0 + ancho; c++) {
      celdas.add(`${r},${c}`);
    }
  }
  return celdas;
}

/**
 * ¿Un candidato se solapa con las celdas ya ocupadas?
 */
function seSolapa(r0, c0, ancho, alto, ocupadas) {
  for (let r = r0; r < r0 + alto; r++) {
    for (let c = c0; c < c0 + ancho; c++) {
      if (ocupadas.has(`${r},${c}`)) return true;
    }
  }
  return false;
}

/**
 * Agrega las celdas de un rectángulo al Set de ocupadas.
 */
function ocuparCeldas(r0, c0, ancho, alto, ocupadas) {
  for (let r = r0; r < r0 + alto; r++) {
    for (let c = c0; c < c0 + ancho; c++) {
      ocupadas.add(`${r},${c}`);
    }
  }
}

/**
 * Libera las celdas de un rectángulo del Set de ocupadas.
 * (Usado al hacer backtrack)
 */
function liberarCeldas(r0, c0, ancho, alto, ocupadas) {
  for (let r = r0; r < r0 + alto; r++) {
    for (let c = c0; c < c0 + ancho; c++) {
      ocupadas.delete(`${r},${c}`);
    }
  }
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 2 — FASE 1: GENERAR CANDIDATOS
// Para cada pista calculamos todos los rectángulos que
// podrían ser válidos solo considerando el tablero.
// ═══════════════════════════════════════════════════════════

/**
 * Genera todos los rectángulos posibles para una pista.
 *
 * Un rectángulo es válido si:
 *   - Su área = valor de la pista.
 *   - Contiene la celda de la pista.
 *   - Cabe dentro del tablero.
 *
 * @param {object} pista - { fila, col, valor }
 * @param {number} totalFilas
 * @param {number} totalCols
 * @returns {Array} Lista de candidatos { r0, c0, ancho, alto }
 */
function generarCandidatos(pista, totalFilas, totalCols) {
  const { fila, col, valor } = pista;
  const candidatos = [];

  for (const { ancho, alto } of obtenerFormas(valor)) {
    // La pista en (fila, col) debe quedar DENTRO del rectángulo.
    // El rect va de r0 a r0+alto-1, entonces:
    //   r0 <= fila  y  r0 + alto - 1 >= fila
    //   → r0 puede ir desde (fila - alto + 1) hasta fila
    // Además r0 no puede ser negativo ni salirse del tablero.
    const filaInicioMin = Math.max(0, fila - alto + 1);
    const filaInicioMax = Math.min(totalFilas - alto, fila);

    const colInicioMin = Math.max(0, col - ancho + 1);
    const colInicioMax = Math.min(totalCols - ancho, col);

    for (let r0 = filaInicioMin; r0 <= filaInicioMax; r0++) {
      for (let c0 = colInicioMin; c0 <= colInicioMax; c0++) {
        candidatos.push({ r0, c0, ancho, alto });
      }
    }
  }

  return candidatos;
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 3 — FASE 2: APLICAR REGLAS
// Aquí eliminamos candidatos que son imposibles por alguna
// regla que notamos al analizar el problema.
// ═══════════════════════════════════════════════════════════

/**
 * REGLA 1 — ESQUINAS
 *
 * Si la pista está en una esquina del tablero, el rectángulo
 * tiene que "pegarse" a esa esquina. No puede flotar.
 *
 * Esquina superior izquierda (0,0)       → r0=0 y c0=0 siempre
 * Esquina superior derecha (0, maxCol)   → r0=0 y c0+ancho=totalCols siempre
 * Esquina inferior izquierda (maxFila,0) → r0+alto=totalFilas y c0=0
 * Esquina inferior derecha               → r0+alto=totalFilas y c0+ancho=totalCols
 */
function reglaEsquinas(candidatos, pista, totalFilas, totalCols) {
  const { fila, col } = pista;

  const enBordeSuperior  = fila === 0;
  const enBordeInferior  = fila === totalFilas - 1;
  const enBordeIzquierdo = col === 0;
  const enBordeDerecho   = col === totalCols - 1;

  // Si no está en ningún borde, esta regla no aplica
  if (!enBordeSuperior && !enBordeInferior && !enBordeIzquierdo && !enBordeDerecho) {
    return candidatos;
  }

  return candidatos.filter(({ r0, c0, ancho, alto }) => {
    // Borde superior: el rectángulo debe empezar en fila 0
    if (enBordeSuperior && r0 !== 0) return false;
    // Borde inferior: el rectángulo debe terminar en la última fila
    if (enBordeInferior && r0 + alto !== totalFilas) return false;
    // Borde izquierdo: el rectángulo debe empezar en columna 0
    if (enBordeIzquierdo && c0 !== 0) return false;
    // Borde derecho: el rectángulo debe terminar en la última columna
    if (enBordeDerecho && c0 + ancho !== totalCols) return false;
    return true;
  });
}

/**
 * REGLA 2 — NÚMEROS PRIMOS
 *
 * Si el valor de la pista es primo, el rectángulo SOLO puede
 * ser una línea (1×n horizontal o n×1 vertical).
 * Esto pasa porque los números primos solo tienen dos divisores:
 * el 1 y ellos mismos. Entonces las únicas formas son 1×n y n×1.
 *
 * Además si n > totalCols solo puede ser vertical (n×1).
 * Si n > totalFilas solo puede ser horizontal (1×n).
 */
function reglaPrimos(candidatos, pista, totalFilas, totalCols) {
  if (!esPrimo(pista.valor)) return candidatos;

  return candidatos.filter(({ ancho, alto }) => {
    const esLinea = ancho === 1 || alto === 1;
    if (!esLinea) return false;
    // Si el número no cabe como línea horizontal, eliminar esa forma
    if (alto === 1 && pista.valor > totalCols) return false;
    // Si el número no cabe como línea vertical, eliminar esa forma
    if (ancho === 1 && pista.valor > totalFilas) return false;
    return true;
  });
}

/**
 * REGLA 3 — OTRA PISTA DENTRO
 *
 * Un rectángulo no puede contener DOS pistas distintas.
 * Si un candidato abarcaría la celda de otra pista, lo eliminamos.
 *
 * Ejemplo: si tenemos [4] y [3] muy cercanos, el rect del 4
 * no puede incluir la celda donde está el 3.
 */
function reglaOtrasPistasAdentro(candidatos, pistaActual, todasLasPistas) {
  return candidatos.filter(({ r0, c0, ancho, alto }) => {
    for (const otra of todasLasPistas) {
      // No comparamos la pista consigo misma
      if (otra.fila === pistaActual.fila && otra.col === pistaActual.col) continue;

      // ¿La otra pista cae dentro de este rectángulo?
      const dentroVertical   = otra.fila >= r0 && otra.fila < r0 + alto;
      const dentroHorizontal = otra.col  >= c0 && otra.col  < c0 + ancho;

      if (dentroVertical && dentroHorizontal) {
        return false; // Este candidato captura otra pista → inválido
      }
    }
    return true;
  });
}

/**
 * REGLA 4 — CUADRADOS PERFECTOS LEJOS DEL CENTRO
 *
 * Si el número es cuadrado perfecto (4, 9, 16...) y la pista
 * está en el borde, la forma cuadrada (n×n) suele no caber bien.
 * Esta regla no elimina, sino que REORDENA poniendo la forma
 * cuadrada al frente si la pista está en el centro, o al final
 * si está en el borde.
 *
 * Así el algoritmo la intenta primero cuando tiene más sentido.
 */
function reglaOrdenCuadrados(candidatos, pista, totalFilas, totalCols) {
  if (!esCuadradoPerfecto(pista.valor) || pista.valor === 1) return candidatos;

  const raiz = Math.sqrt(pista.valor);
  const centroFila = totalFilas / 2;
  const centroCol  = totalCols / 2;

  // ¿Está cerca del centro?
  const cercaDelCentro =
    Math.abs(pista.fila - centroFila) < totalFilas / 4 &&
    Math.abs(pista.col - centroCol)  < totalCols / 4;

  // Separar el candidato cuadrado (si existe) de los demás
  const cuadrado = candidatos.filter(c => c.ancho === raiz && c.alto === raiz);
  const resto    = candidatos.filter(c => !(c.ancho === raiz && c.alto === raiz));

  // Cerca del centro: probar cuadrado primero
  // Lejos del centro: probar cuadrado al final
  return cercaDelCentro ? [...cuadrado, ...resto] : [...resto, ...cuadrado];
}

/**
 * Aplica todas las reglas en orden a los candidatos de una pista.
 * Devuelve los candidatos que sobrevivieron al filtrado.
 */
function aplicarReglas(candidatos, pista, todasLasPistas, totalFilas, totalCols) {
  let restantes = candidatos;

  restantes = reglaEsquinas(restantes, pista, totalFilas, totalCols);
  restantes = reglaPrimos(restantes, pista, totalFilas, totalCols);
  restantes = reglaOtrasPistasAdentro(restantes, pista, todasLasPistas);
  restantes = reglaOrdenCuadrados(restantes, pista, totalFilas, totalCols);

  return restantes;
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 4 — FASE 3: PROPAGACIÓN EN CASCADA
// Si una pista tiene un solo candidato → asignarla ya.
// Eso puede hacer que otras queden con uno solo → repetir.
// Es como el efecto dominó: una decisión arrastra otras.
// ═══════════════════════════════════════════════════════════

/**
 * Recorre todas las pistas sin asignar.
 * Si alguna quedó con exactamente 1 candidato (debido a que
 * las celdas ya fueron ocupadas), la asigna y actualiza las demás.
 *
 * Repite el proceso hasta que ya no haya cambios.
 *
 * @param {Array}  tablaCandidatos - tablaCandidatos[i] = lista de candidatos de pista i
 * @param {Array}  pistas          - lista de todas las pistas
 * @param {Set}    ocupadas        - celdas ya tomadas
 * @param {Map}    asignadas       - pistaIdx → candidato elegido
 * @returns {boolean} false si se detectó una contradicción (alguna pista quedó sin candidatos)
 */
function propagarCascada(tablaCandidatos, pistas, ocupadas, asignadas, trace = null) {
  let huboCambios = true;

  while (huboCambios) {
    huboCambios = false;

    for (let i = 0; i < pistas.length; i++) {
      if (asignadas.has(i)) continue;

      tablaCandidatos[i] = tablaCandidatos[i].filter(
        ({ r0, c0, ancho, alto }) => !seSolapa(r0, c0, ancho, alto, ocupadas)
      );

      if (tablaCandidatos[i].length === 0) {
        if (trace) trace({ phase: 'contradiccion', etapa: 'cascada', pistaIdx: i });
        return false;
      }

      if (tablaCandidatos[i].length === 1) {
        const cand = tablaCandidatos[i][0];
        asignadas.set(i, cand);
        ocuparCeldas(cand.r0, cand.c0, cand.ancho, cand.alto, ocupadas);
        huboCambios = true;
        if (trace) trace({
          phase: 'cascada', pistaIdx: i,
          row: pistas[i].fila, col: pistas[i].col, valor: pistas[i].valor,
          rect: { r0: cand.r0, c0: cand.c0, w: cand.ancho, h: cand.alto }
        });
      }
    }
  }

  return true;
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 4.5 — FASE 3.5: PROPAGACIÓN POR CELDAS OBLIGADAS
//
// Idea muy simple:
//   Cada celda del tablero TIENE que ser cubierta por algún rectángulo.
//   Para cada celda libre miramos cuántos candidatos podrían taparla.
//
//   Si SOLO los candidatos de UNA pista pueden cubrir esa celda,
//   entonces esa pista está obligada a usar uno de esos candidatos
//   (los demás candidatos de esa pista se eliminan).
//
//   Si además solo UN candidato puede cubrirla, ese candidato queda fijo.
//
// Al eliminar candidatos, la cascada vuelve a actuar y se asignan
// pistas forzadas. Repetimos hasta que nada cambie.
// ═══════════════════════════════════════════════════════════

/**
 * Restringe candidatos usando el hecho de que toda celda debe estar cubierta.
 *
 * @returns {boolean} false si se detecta contradicción
 */
function propagarCeldasObligadas(tablaCandidatos, pistas, ocupadas, asignadas, trace = null) {
  let huboCambios = true;

  while (huboCambios) {
    huboCambios = false;

    // Para cada celda libre, registrar qué pistas (y qué candidatos suyos)
    // pueden cubrirla. Guardamos REFERENCIAS al objeto candidato (no índices)
    // para no romperse si la lista se recorta mientras iteramos.
    //   cobertura: "r,c" → Map<pistaIdx, Set<candObj>>
    const cobertura = new Map();

    for (let i = 0; i < pistas.length; i++) {
      if (asignadas.has(i)) continue;

      const cands = tablaCandidatos[i];
      for (let k = 0; k < cands.length; k++) {
        const cand = cands[k];
        const { r0, c0, ancho, alto } = cand;
        for (let r = r0; r < r0 + alto; r++) {
          for (let c = c0; c < c0 + ancho; c++) {
            const key = `${r},${c}`;
            if (ocupadas.has(key)) continue;
            let porPista = cobertura.get(key);
            if (!porPista) { porPista = new Map(); cobertura.set(key, porPista); }
            let setCands = porPista.get(i);
            if (!setCands) { setCands = new Set(); porPista.set(i, setCands); }
            setCands.add(cand);
          }
        }
      }
    }

    // Recolectar las restricciones antes de aplicar (para evitar mutaciones
    // intercaladas que invaliden la información ya recogida)
    //   restricciones: pistaIdx → Set<candObj> permitidos
    //   ejemploCelda:  pistaIdx → "r,c" (una celda que dispara la restricción, para trace)
    const restricciones = new Map();
    const ejemploCelda = new Map();

    for (const [cellKey, porPista] of cobertura) {
      if (porPista.size !== 1) continue;

      const [pistaIdx, setCands] = porPista.entries().next().value;
      if (asignadas.has(pistaIdx)) continue;

      if (!ejemploCelda.has(pistaIdx)) ejemploCelda.set(pistaIdx, cellKey);

      // Intersectar con restricciones previas de la misma pista (si las hay)
      const previo = restricciones.get(pistaIdx);
      if (!previo) {
        restricciones.set(pistaIdx, new Set(setCands));
      } else {
        const inter = new Set();
        for (const x of previo) if (setCands.has(x)) inter.add(x);
        restricciones.set(pistaIdx, inter);
      }
    }

    // Aplicar restricciones
    for (const [pistaIdx, permitidos] of restricciones) {
      const actuales = tablaCandidatos[pistaIdx];
      if (permitidos.size === actuales.length) continue; // sin cambio
      const filtrados = actuales.filter(c => permitidos.has(c));
      if (filtrados.length === 0) {
        if (trace) trace({ phase: 'contradiccion', etapa: 'celdas', pistaIdx });
        return false;
      }
      if (filtrados.length !== actuales.length) {
        if (trace) {
          const cellKey = ejemploCelda.get(pistaIdx);
          let celdaR = -1, celdaC = -1;
          if (cellKey) {
            const [cr, cc] = cellKey.split(',').map(Number);
            celdaR = cr; celdaC = cc;
          }
          // Listar candidatos eliminados (para mostrar al usuario)
          const eliminados = actuales.filter(c => !permitidos.has(c)).map(c => ({
            r0: c.r0, c0: c.c0, w: c.ancho, h: c.alto
          }));
          const sobrevivientes = filtrados.map(c => ({
            r0: c.r0, c0: c.c0, w: c.ancho, h: c.alto
          }));
          trace({
            phase: 'celda', pistaIdx,
            row: pistas[pistaIdx].fila, col: pistas[pistaIdx].col, valor: pistas[pistaIdx].valor,
            celdaR, celdaC,
            candidatosAntes: actuales.length, candidatosDespues: filtrados.length,
            eliminados, sobrevivientes
          });
        }
        tablaCandidatos[pistaIdx] = filtrados;
        huboCambios = true;
      }
    }

    // Si recortamos algo, dejar que la cascada saque las nuevas forzadas
    if (huboCambios) {
      const ok = propagarCascada(tablaCandidatos, pistas, ocupadas, asignadas, trace);
      if (!ok) return false;
    }
  }

  return true;
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 5 — FASE 4: BÚSQUEDA CON TABLA DP
//
// Para las pistas que no se resolvieron por cascada,
// usamos Programación Dinámica con Tabulación.
//
// La idea central:
//   TABLA_DP[paso] = lista de todos los estados válidos
//                    después de haber decidido "paso" pistas.
//
//   Un "estado" guarda qué candidato elegimos para cada pista
//   y qué celdas quedaron ocupadas.
//
// Procesamos de la pista con MENOS candidatos a la que tiene MÁS.
// Así descartamos caminos sin salida lo antes posible.
// ═══════════════════════════════════════════════════════════

/**
 * Verificación hacia adelante (forward checking).
 *
 * Antes de avanzar al siguiente paso, revisamos que TODAS las pistas
 * que faltan por asignar siguen teniendo al menos un candidato libre.
 *
 * Si alguna quedó sin opciones (porque las celdas que necesitaba ya
 * fueron ocupadas), esta rama nunca llevará a una solución.
 * Detectarlo aquí evita explorar miles de combinaciones inútiles.
 *
 * @param {number[]} ordenBusqueda    - Índices de pistas en orden de búsqueda
 * @param {number}   pasoDesde        - El primer paso que aún no fue asignado
 * @param {Array}    tablaCandidatos  - tablaCandidatos[i] = candidatos de pista i
 * @param {Set}      ocupadasBusqueda - Celdas ya tomadas en este camino
 * @returns {boolean} true si todas tienen al menos un candidato libre
 */
function verificarTodasTienenSalida(ordenBusqueda, pasoDesde, tablaCandidatos, ocupadasBusqueda) {
  for (let p = pasoDesde; p < ordenBusqueda.length; p++) {
    const idx = ordenBusqueda[p];
    let hayAlguno = false;
    for (const { r0, c0, ancho, alto } of tablaCandidatos[idx]) {
      if (!seSolapa(r0, c0, ancho, alto, ocupadasBusqueda)) {
        hayAlguno = true;
        break; // Con uno basta, no hace falta seguir revisando
      }
    }
    if (!hayAlguno) return false; // Esta pista quedó sin opciones → contradicción
  }
  return true;
}

/**
 * Búsqueda con tabla de decisiones (DP iterativo + verificación hacia adelante).
 *
 * Mantenemos una TABLA DE DECISIONES explícita:
 *   tablaDecisiones[paso] = índice del candidato elegido en ese paso
 *
 * Avanzamos llenando la tabla paso a paso. Si en algún paso no hay
 * candidato válido, retrocedemos (borramos la última entrada) y
 * probamos el siguiente. Esto se llama backtracking pero la tabla
 * lo hace completamente iterativo y explícito — no hay recursión.
 *
 * En cada paso, antes de avanzar, comprobamos con verificarTodasTienenSalida
 * que las pistas restantes siguen viables. Si no, descartamos ese candidato
 * y probamos el siguiente — sin explorar toda la rama muerta.
 *
 * ¿Por qué esto es DP con tabulación?
 *   Porque la tabla registra las decisiones previas y las reutilizamos
 *   para construir la solución al llegar al último paso. Cada celda
 *   de la tabla depende de las anteriores (subestructura óptima).
 */
function buscarConTablaDP(
  indicesSinAsignar,
  tablaCandidatos,
  ocupadasBase,
  asignadasBase,
  pistas,
  filas,
  cols,
  maxSoluciones,
  tiempoLimite,
  onProgress,
  onSolucion,
  trace = null
) {
  const inicio         = performance.now();
  const soluciones     = [];
  let totalEncontradas = 0;
  let nodos            = 0;
  let tiempoAgotado    = false;

  // Ordenar: primero las pistas con MENOS candidatos.
  // Así chocamos con contradicciones antes y ahorramos exploración.
  const ordenBusqueda = [...indicesSinAsignar].sort(
    (a, b) => tablaCandidatos[a].length - tablaCandidatos[b].length
  );
  const totalPasos = ordenBusqueda.length;

  if (trace) trace({
    phase: 'dp_orden',
    orden: ordenBusqueda.map((idx, paso) => ({
      paso,
      pistaIdx: idx,
      row: pistas[idx].fila, col: pistas[idx].col, valor: pistas[idx].valor,
      candidatos: tablaCandidatos[idx].length
    }))
  });

  // ─── LA TABLA DE DECISIONES ────────────────────────────────────────
  // tablaDecisiones[paso] = índice del candidato elegido para ese paso.
  // -1 significa "en este paso aún no hemos elegido nada todavía".
  //
  // Ejemplo de tabla llena para 4 pistas:
  //   tablaDecisiones = [2, 0, 3, 1]
  //   → paso 0: eligió el candidato #2 de su pista
  //   → paso 1: eligió el candidato #0 de su pista
  //   → paso 2: eligió el candidato #3 de su pista
  //   → paso 3: eligió el candidato #1 de su pista
  const tablaDecisiones = new Array(totalPasos).fill(-1);

  // Celdas ocupadas durante la búsqueda (se actualiza al avanzar/retroceder)
  const ocupadasBusqueda = new Set(ocupadasBase);

  // ─── BUCLE PRINCIPAL ───────────────────────────────────────────────
  // paso = en qué fila de la tabla estamos trabajando ahora.
  let paso = 0;

  while (paso >= 0 && paso <= totalPasos) {

    // Control de tiempo y progreso cada 512 nodos
    if ((++nodos & 511) === 0) {
      if (performance.now() - inicio > tiempoLimite) { tiempoAgotado = true; break; }
      if (onProgress) {
        const cancelar = onProgress(nodos, performance.now() - inicio);
        if (cancelar) { tiempoAgotado = true; break; }
      }
    }

    // ─── ¿LLENAMOS TODA LA TABLA? → SOLUCIÓN ENCONTRADA ───────────
    if (paso === totalPasos) {
      totalEncontradas++;

      const todasLasAsignaciones = new Map(asignadasBase);
      for (let p = 0; p < totalPasos; p++) {
        const idx  = ordenBusqueda[p];
        const cand = tablaCandidatos[idx][tablaDecisiones[p]];
        todasLasAsignaciones.set(idx, cand);
      }

      const sol = construirSolucion(todasLasAsignaciones, pistas, tablaCandidatos);
      if (soluciones.length < 10) {
        soluciones.push(sol);
        if (onSolucion) try { onSolucion(sol, totalEncontradas); } catch {}
        if (trace) trace({ phase: 'solucion', numero: totalEncontradas });
      }

      if (totalEncontradas >= maxSoluciones) break;

      paso--;
      const idxRet  = ordenBusqueda[paso];
      const candRet = tablaCandidatos[idxRet][tablaDecisiones[paso]];
      liberarCeldas(candRet.r0, candRet.c0, candRet.ancho, candRet.alto, ocupadasBusqueda);
      continue;
    }

    const idxPista   = ordenBusqueda[paso];
    const candidatos = tablaCandidatos[idxPista];
    let encontrado   = false;
    let candidatosIntentados = 0;
    let candidatosDescartadosFwd = 0;

    for (let ci = tablaDecisiones[paso] + 1; ci < candidatos.length; ci++) {
      const { r0, c0, ancho, alto } = candidatos[ci];
      candidatosIntentados++;

      if (!seSolapa(r0, c0, ancho, alto, ocupadasBusqueda)) {
        ocuparCeldas(r0, c0, ancho, alto, ocupadasBusqueda);

        if (verificarTodasTienenSalida(ordenBusqueda, paso + 1, tablaCandidatos, ocupadasBusqueda)) {
          tablaDecisiones[paso] = ci;
          encontrado = true;
          if (trace) trace({
            phase: 'dp_pick', paso, pistaIdx: idxPista,
            row: pistas[idxPista].fila, col: pistas[idxPista].col, valor: pistas[idxPista].valor,
            candIdx: ci, totalCandidatos: candidatos.length,
            descartadosForward: candidatosDescartadosFwd,
            rect: { r0, c0, w: ancho, h: alto }
          });
          break;
        }

        candidatosDescartadosFwd++;
        if (trace) trace({
          phase: 'forward_skip', paso, pistaIdx: idxPista,
          row: pistas[idxPista].fila, col: pistas[idxPista].col, valor: pistas[idxPista].valor,
          rect: { r0, c0, w: ancho, h: alto }
        });
        liberarCeldas(r0, c0, ancho, alto, ocupadasBusqueda);
      }
    }

    if (encontrado) {
      paso++;
    } else {
      tablaDecisiones[paso] = -1;
      if (trace) trace({
        phase: 'backtrack', paso,
        pistaIdx: idxPista,
        row: pistas[idxPista].fila, col: pistas[idxPista].col, valor: pistas[idxPista].valor,
        razon: 'sin candidatos viables',
        candidatosProbados: candidatosIntentados
      });
      paso--;

      if (paso >= 0) {
        const idxAnt  = ordenBusqueda[paso];
        const candAnt = tablaCandidatos[idxAnt][tablaDecisiones[paso]];
        liberarCeldas(candAnt.r0, candAnt.c0, candAnt.ancho, candAnt.alto, ocupadasBusqueda);
      }
    }
  }

  return { soluciones, totalEncontradas, tiempoAgotado };
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 6 — CONVERTIR EL RESULTADO AL FORMATO DE LA APP
// La app espera soluciones en formato { clue, rect }.
// Aquí convertimos nuestras estructuras internas a ese formato.
// ═══════════════════════════════════════════════════════════

/**
 * Convierte el mapa de asignaciones al formato que usa la app:
 * un array de { clue: {row, col, value}, rect: {r0, c0, w, h} }
 */
function construirSolucion(asignaciones, pistas, tablaCandidatos) {
  const sol = [];
  for (const [idx, cand] of asignaciones) {
    const pista = pistas[idx];
    sol.push({
      clue: { row: pista.fila, col: pista.col, value: pista.valor },
      rect: { r0: cand.r0, c0: cand.c0, w: cand.ancho, h: cand.alto }
    });
  }
  return sol;
}

/**
 * Convierte las pistas del formato de la app (row, col, value)
 * al formato interno que usamos (fila, col, valor).
 */
function convertirPistas(pistasApp) {
  return pistasApp.map(p => ({
    fila:  p.row,
    col:   p.col,
    valor: p.value
  }));
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 7 — FUNCIÓN PRINCIPAL
// Aquí se llaman todas las fases en orden.
// ═══════════════════════════════════════════════════════════

/**
 * Resuelve un puzzle Shikaku usando nuestro algoritmo propio.
 *
 * API estable usada por la app y el worker.
 *
 * @param {number[][]} grid           - Tablero (0=vacío, >0=pista)
 * @param {Array}      pistasApp      - [{row, col, value}, ...]
 * @param {number}     maxSoluciones  - Cuántas soluciones buscar
 * @param {number}     tiempoLimite   - Milisegundos máximos
 * @param {Function}   onProgress     - Callback de progreso(nodos, ms)
 * @param {Function}   onSolucion     - Callback por cada solución(sol, count)
 * @returns {{ solutions, count, timedOut, stats }}
 */
export function solvePropio(
  grid,
  pistasApp,
  maxSoluciones = Infinity,
  tiempoLimite  = 15000,
  onProgress    = null,
  onSolucion    = null,
  onTrace       = null
) {
  const t0   = performance.now();
  const filas = grid.length;
  const cols  = grid[0].length;

  const trace = onTrace ? (ev) => { try { onTrace(ev); } catch {} } : null;

  // Convertir al formato interno
  const pistas = convertirPistas(pistasApp);

  if (pistas.length === 0) {
    return _resultado([], 0, false, t0);
  }

  // Comprobación rápida: la suma de valores debe cubrir todo el tablero
  const sumaValores = pistas.reduce((s, p) => s + p.valor, 0);
  if (sumaValores !== filas * cols) {
    return _resultado([], 0, false, t0);
  }

  // ─── FASE 1: Generar candidatos ─────────────────────────────
  const tablaCandidatos = pistas.map(p => generarCandidatos(p, filas, cols));
  if (trace) trace({ phase: 'generar', pistas: pistas.map((p, i) => ({
    pistaIdx: i, row: p.fila, col: p.col, valor: p.valor,
    candidatos: tablaCandidatos[i].length
  })) });

  // ─── FASE 2: Aplicar reglas ──────────────────────────────────
  for (let i = 0; i < pistas.length; i++) {
    const antes = tablaCandidatos[i].length;
    tablaCandidatos[i] = aplicarReglas(
      tablaCandidatos[i], pistas[i], pistas, filas, cols
    );
    const despues = tablaCandidatos[i].length;
    if (trace && despues !== antes) {
      trace({
        phase: 'reglas', pistaIdx: i,
        row: pistas[i].fila, col: pistas[i].col, valor: pistas[i].valor,
        candidatosAntes: antes, candidatosDespues: despues
      });
    }
    if (tablaCandidatos[i].length === 0) {
      return _resultado([], 0, false, t0);
    }
  }

  // ─── FASE 3: Propagación en cascada ─────────────────────────
  const ocupadas   = new Set();
  const asignadas  = new Map();
  const tablaParaCascada = tablaCandidatos.map(c => [...c]);

  const sinContradiccion = propagarCascada(
    tablaParaCascada, pistas, ocupadas, asignadas, trace
  );

  if (!sinContradiccion) {
    return _resultado([], 0, false, t0);
  }

  // ─── FASE 3.5: Propagación por celdas obligadas ─────────────
  const sinContradiccionCeldas = propagarCeldasObligadas(
    tablaParaCascada, pistas, ocupadas, asignadas, trace
  );

  if (!sinContradiccionCeldas) {
    return _resultado([], 0, false, t0);
  }

  // ─── FASE 4: Búsqueda con tabla DP ──────────────────────────
  // Para las pistas que NO se resolvieron por cascada, buscamos
  // usando la tabla de estados DP.
  const indicesSinAsignar = pistas
    .map((_, i) => i)
    .filter(i => !asignadas.has(i));

  let soluciones        = [];
  let totalEncontradas  = 0;
  let tiempoAgotado     = false;

  if (indicesSinAsignar.length === 0) {
    // ¡La cascada resolvió TODO el puzzle sola! Caso ideal.
    if (trace) trace({ phase: 'sin_dp' });
    const sol = construirSolucion(asignadas, pistas, tablaParaCascada);
    soluciones = [sol];
    totalEncontradas = 1;
    if (onSolucion) try { onSolucion(sol, 1); } catch {}

  } else {
    // Todavía quedan pistas sin resolver → búsqueda DP
    const resultado = buscarConTablaDP(
      indicesSinAsignar,
      tablaParaCascada,
      ocupadas,
      asignadas,
      pistas,
      filas,
      cols,
      maxSoluciones,
      tiempoLimite - (performance.now() - t0),
      onProgress,
      onSolucion,
      trace
    );

    soluciones       = resultado.soluciones;
    totalEncontradas = resultado.totalEncontradas;
    tiempoAgotado    = resultado.tiempoAgotado;
  }

  return _resultado(soluciones, totalEncontradas, tiempoAgotado, t0);
}

/**
 * Construye el objeto de resultado estándar que espera la app.
 */
function _resultado(soluciones, count, tiempoAgotado, t0) {
  return {
    solutions: soluciones,
    count,
    timedOut: tiempoAgotado,
    stats: {
      timeMs:         Math.round((performance.now() - t0) * 100) / 100,
      nodesExplored:  0,
      backtracks:     0,
      prunedBranches: 0,
      clueOrder:      [],
      perClue:        []
    }
  };
}


// ═══════════════════════════════════════════════════════════
// BLOQUE 8 — UTILIDADES PÚBLICAS
// API estable que consume el resto de la app (ui, generator,
// worker). Mantiene la convención original {r0,c0,w,h}.
// ═══════════════════════════════════════════════════════════

/**
 * Devuelve todas las factorizaciones de n como pares [w, h].
 */
export function getFactorizations(n) {
  const result = [];
  for (let w = 1; w <= n; w++) {
    if (n % w === 0) result.push([w, n / w]);
  }
  return result;
}

/**
 * Genera todos los rectángulos candidatos para una pista
 * en formato {r0, c0, w, h}.
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
 * Extrae las pistas de una grilla.
 */
export function extractClues(grid) {
  const clues = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[0].length; c++)
      if (grid[r][c] > 0) clues.push({ row: r, col: c, value: grid[r][c] });
  return clues;
}

/**
 * Valida una solución: cobertura única, pistas dentro de su rect,
 * área = valor, sin desbordes.
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

