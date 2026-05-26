# Shikaku — Juego y solucionador

App web para jugar **Shikaku** y, sobre todo, para mostrar **cómo el computador lo resuelve paso a paso**.
Este README explica el juego, las ideas que usa el algoritmo y cómo se organiza el código, en lenguaje sencillo.

---

## 1. ¿Qué es Shikaku?

Shikaku es un puzzle japonés que se juega en una grilla cuadriculada con algunos números.

**Objetivo**: partir el tablero en **rectángulos** de modo que:

1. Cada rectángulo contenga **exactamente un número**.
2. El **área** del rectángulo (`ancho × alto`) sea **igual a ese número**.
3. Los rectángulos **no se solapen** y entre todos **cubran todo** el tablero.

```
ANTES (puzzle)              DESPUÉS (solución)
+---+---+---+---+           +---+---+---+---+
|   |   | 6 |   |           |   |   |6 6|   |
+---+---+---+---+           +   +   +---+   +
| 4 |   |   |   |     →     |4 4|   |   |   |
+---+---+---+---+           +   +   +   +   +
|   |   |   | 2 |           |4 4|   |   | 2 |
+---+---+---+---+           +---+   +---+   +
|   |   | 4 |   |           |   |   |4 4| 2 |
+---+---+---+---+           +---+---+---+---+
```

Comprobación: 6 + 4 + 2 + 4 = 16 = 4×4. ✓

---

## 2. ¿Cómo lo resolvería una persona?

Antes de mirar código, conviene entender las **observaciones humanas** — porque el algoritmo no hace nada distinto, solo más rápido.

### 2.1 Tabla de formas posibles

Cada número solo puede ser rectángulo de tantas formas como divisores tenga:

| Valor | Formas posibles      | Comentario             |
|-------|----------------------|------------------------|
| **2** | `1×2` `2×1`          | Primo → siempre línea  |
| **3** | `1×3` `3×1`          | Primo → siempre línea  |
| **4** | `1×4` `4×1` `2×2`    | Línea o cuadrado       |
| **5** | `1×5` `5×1`          | Primo → siempre línea  |
| **6** | `1×6` `2×3` `3×2` `6×1` | 4 formas            |
| **7** | `1×7` `7×1`          | Primo → siempre línea  |
| **8** | `1×8` `2×4` `4×2` `8×1` | Sin cuadrado        |
| **9** | `1×9` `3×3` `9×1`    | Línea o cuadrado       |

→ **Los primos** (2, 3, 5, 7, 11…) son los más fáciles para empezar. Solo pueden ser líneas.

### 2.2 Pistas en bordes y esquinas

Si una pista está pegada a un borde, su rectángulo está **obligado** a pegarse a ese borde (no puede flotar fuera).

```
Pista en esquina (0,0) con valor 6, tablero 6×6:

+---+---+---+---+---+---+
| 6 |   |   |   |   |   |
+---+---+---+---+---+---+
         ...

→ Solo dos opciones:  1×6 horizontal  o  6×1 vertical.
```

### 2.3 Cuadrados perfectos en el centro

Si la pista vale 4, 9, 16… y está cerca del centro, su forma natural suele ser el **cuadrado** (2×2, 3×3, 4×4). Lejos del centro, suele tocarle ser línea.

### 2.4 Otra pista adentro = imposible

Un rectángulo no puede comerse otra pista. Si `1×6` implicaría abarcar la celda donde hay un `3`, ese candidato muere.

### 2.5 La suma siempre cuadra

`Σ (valores de pistas) = filas × columnas`. Si no se cumple, el puzzle está mal definido. Se chequea antes de resolver.

---

## 3. El algoritmo en cinco fases

El solver trabaja en **cinco fases**. Las primeras cuatro son **propagación lógica** (no adivina nada). La quinta solo se usa si todavía quedan dudas.

```
   ┌─────────────────────────────────────────────────┐
   │  Fase 1: Generar candidatos                     │
   │  Fase 2: Aplicar reglas (filtrar imposibles)    │
   │  Fase 3: Cascada (asignar forzados en cadena)   │
   │  Fase 4: Celdas obligadas (¿quién me cubre?)    │
   │  Fase 5: Backtracking iterativo (probar)        │
   └─────────────────────────────────────────────────┘
```

### Fase 1 — Generar candidatos

Para cada pista, lista **todos** los rectángulos que cumplen:

- área = valor,
- contienen la celda de la pista,
- entran en el tablero.

Ejemplo (pista `6` en (0,0), tablero 4×4):

```
2×3 cabe solo aquí:               3×2 cabe solo aquí:
+---+---+---+---+                 +---+---+---+---+
|###|###|###|   |                 |###|###|   |   |
+---+---+---+---+                 +---+---+---+---+
|###|###|###|   |                 |###|###|   |   |
+---+---+---+---+                 +---+---+---+---+
|   |   |   |   |                 |###|###|   |   |
+---+---+---+---+                 +---+---+---+---+
```

Resultado: la pista `6` tiene **2 candidatos**.

### Fase 2 — Aplicar reglas

Tacha candidatos imposibles **antes de probar nada**:

| Regla              | Qué descarta                                                              |
|--------------------|---------------------------------------------------------------------------|
| **Esquinas**       | Rectángulos que no se "pegan" al borde donde está la pista.               |
| **Primos**         | Para 2, 3, 5, 7, 11…, descarta todo lo que no sea línea.                  |
| **Otra pista adentro** | Cualquier candidato que abarque la celda de otra pista.               |
| **Cuadrado centro/borde** | Reordena: cuadrado primero si la pista está al centro, último si está al borde. |

### Fase 3 — Cascada (efecto dominó)

Si alguna pista quedó con **un solo candidato**, se asigna. Esa asignación ocupa celdas → otras pistas pierden candidatos → puede quedar otra con un solo candidato → se asigna también. Y así hasta que nada cambie.

```
1 candidato → ASIGNAR → otras pierden opciones → más quedan con 1 candidato → ASIGNAR…
```

En tableros pequeños (4×4 a 8×8) esto **resuelve casi todo solo**.

### Fase 4 — Celdas obligadas

Idea clave: cada celda libre del tablero **tiene que ser cubierta por alguien**. Para cada celda, preguntamos:

> ¿Qué pistas tienen al menos un candidato que pase por aquí?

Si la respuesta es **una sola pista**, esa pista está **obligada** a cubrir esta celda. Los candidatos suyos que no pasen por ella se descartan, y eso suele despertar más cascadas.

Esta fase fue la que más rendimiento aportó:

- 13×13: `506 ms → 0.6 ms`
- 14×14: `17.9 s → 52 ms`
- 23×23: timeout → `552 ms`

### Fase 5 — Backtracking iterativo con tabla de decisiones

Si todavía quedan pistas con varias opciones, hay que **probar combinaciones**.
Se mantiene una **tabla** donde cada fila es un paso (= una pista pendiente) y se anota qué candidato se eligió.

```
        elegido
paso 0  →  candidato 2 de pista A
paso 1  →  candidato 0 de pista B
paso 2  →  candidato ?  ← buscando…
```

Detalles importantes:

- **MRV (Minimum Remaining Values)**: las pistas pendientes se procesan **de menos candidatos a más**. Así, si vamos a fallar, fallamos rápido.
- **Forward-check**: antes de avanzar, verificamos que **todas las pistas siguientes** sigan teniendo al menos un candidato libre. Si no, descartamos sin entrar a la rama muerta.
- **Iterativo (no recursivo)**: la tabla guarda el estado en cada nivel y un bucle `while` avanza/retrocede. Cero stack frames.

```
avanzar:   paso 0 → paso 1 → paso 2  ✓
                                ↓
                            paso 3   ✗ contradicción
                                ↑
backtrack:                  paso 2 (probar siguiente candidato)
```

Cuando se llena toda la tabla → **solución encontrada**.

---

## 4. Verificador independiente (DLX)

El solver principal es `solver_propio.js`. Pero, ¿cómo sabemos que su respuesta es **correcta**? Para eso existe un segundo algoritmo: **DLX** (Dancing Links / Algorithm X de Knuth), en `solver_dlx.js`.

### 4.1 ¿Para qué sirve?

DLX **no resuelve puzzles para el jugador**. Es un **verificador cruzado**: corre el mismo puzzle con un algoritmo estructuralmente distinto y cuenta cuántas soluciones encuentra. La app compara:

```
   solver_propio  ───▶  N soluciones
                                       ¿coinciden?
   solver_dlx     ───▶  M soluciones
```

- **`N === M`** → ambos algoritmos están de acuerdo, la respuesta es confiable.
- **`N !== M`** → hay un bug en alguno. Aparece pill roja en el modal de algoritmo.

### 4.2 ¿Por qué DLX y no otro?

Porque ataca el problema con una representación **completamente distinta**:

| Aspecto | `solver_propio.js`                                  | `solver_dlx.js`                       |
|---------|-----------------------------------------------------|---------------------------------------|
| Idea    | Propagación lógica + backtracking con tabla         | Cobertura exacta + listas enlazadas   |
| Poda    | Reglas, cascada, celdas obligadas, forward-check    | "Choose column with fewest options"   |
| Estado  | Sets de candidatos por pista                        | Matriz dispersa con punteros          |

Si dos algoritmos tan distintos coinciden en el conteo, es **muy improbable** que ambos tengan el mismo bug. Misma idea que usar dos compiladores para validar código.

### 4.3 Beneficios

- **Detección temprana de bugs** en el solver propio: si tocamos algo y rompemos, DLX lo grita en el siguiente puzzle.
- **Confianza al generar mapas**: el generador requiere "solución única"; DLX la confirma de forma independiente.
- **No afecta al juego**: corre en un Web Worker aparte.

> Resumen: el solver propio **juega**, DLX **vigila**.

---

## 5. Funciones especiales de la app

### 5.1 Precomputo silencioso en mapas Difícil/Experto

En **D4 (Difícil)** y **D5 (Experto)** los tableros son grandes (15×15 a 40×40) y el solver puede tardar varios segundos.

Para que la experiencia sea fluida:

- **Apenas entras al mapa**, el solver arranca en segundo plano (Web Worker silencioso).
- El **botón Pista** queda inhabilitado hasta que la búsqueda termine — así nunca se traba la UI.
- Si presionas **Resolver** mientras todavía está buscando, te enganchas a esa misma búsqueda y ves el progreso real (`Resolviendo… 300K nodos`).
- Si presionas **Resolver** después que terminó, la respuesta es instantánea (ya estaba cacheada).
- Si **reinicias** el nivel o **vuelves al menú**, la búsqueda se cancela limpiamente.

### 5.2 Paso a paso visual ("¿cómo encontró esta solución?")

Cuando el solver termina, aparece un botón que abre un modal con la **explicación visual** del razonamiento:

- Lista de **decisiones** (cada cascada, cada `dp_pick`, cada `backtrack`) con mini-grillas.
- **Verificador del trace**: si el trace se corta o se enreda en mapas grandes, se **sintetiza** un trace limpio a partir de la solución real (avisando con banner ámbar).
- **Estadísticas**: candidatos por pista, MRV, tiempo, comparación con DLX.

Topes para no saturar la UI:

- 8 000 eventos máximo.
- 800 `dp_pick + backtrack`.
- 30 `forward_skip` mostrados (el resto se cuentan pero no se pintan).
- Eventos de cierre (`solucion`, `contradiccion`) siempre entran.

### 5.3 Generador con solución única

`generator.js` crea puzzles aleatorios y verifica con el solver que tengan **exactamente una solución**. Si no, reintenta.

### 5.4 Tabs de la pantalla principal

- **Jugar**: niveles preconstruidos (1 a 5 dificultades × N niveles).
- **Crear**: editor visual; el botón Verificar usa el solver para validar antes de jugar.
- **Subir**: carga de mapas externos (JSON / texto) con la misma validación.
- **Competir**: comparativa de tiempos solver-propio vs DLX sobre mapas guardados.

---

## 6. Estructura del código

```
shikaku/js/
├── solver_propio.js   ← algoritmo principal (5 fases)
├── solver_dlx.js      ← verificador cruzado (DLX / Algorithm X)
├── solver.worker.js   ← envuelve los solvers en Web Worker (SOLVE, VERIFY_DLX)
├── generator.js       ← crea puzzles aleatorios con solución única
├── board.js           ← canvas del tablero, interacción del jugador, zoom/pan
├── ui.js              ← pantallas, modales, eventos, paso a paso visual
├── maps.js            ← mapas preset decorativos
├── constants.js       ← config de dificultades, colores, timeouts
└── main.js            ← punto de entrada
```

Dependencias:

```
main.js
   └─ ui.js
        ├─ board.js
        ├─ generator.js ──── solver_propio.js
        ├─ solver_propio.js
        └─ solver.worker.js (en otro hilo)
              ├─ solver_propio.js
              └─ solver_dlx.js
```

---

## 7. Resumen en una frase

> **Tachar lo imposible, encadenar lo obligatorio, restringir por celdas, y probar lo poco que quede con paso atrás iterativo. DLX vigila.**

---

## 8. Resultados del benchmark (50 mapas)

5 dificultades × 10 niveles. Solver con todas las fases activas, timeout 30 s:

```
D1 (4×4 – 5×5):     10/10  ·  total 1.15 ms   ·  máx 0.40 ms
D2 (6×6 – 8×8):     10/10  ·  total 17 ms     ·  máx 13.8 ms
D3 (9×9 – 14×14):   10/10  ·  total 398 ms    ·  máx 341 ms
D4 (15×15 – 25×25): 10/10  ·  total 59.8 s    ·  máx 30 s
D5 (26×26 – 40×40): 10/10  ·  total 30.8 s    ·  máx 30 s
TOTAL:              50/50  ·  acumulado 91 s
```

Antes de agregar la fase 4 (celdas obligadas): **41/50** resueltos. Después: **50/50**.

---

## 9. Glosario rápido

| Término          | Significado                                                                       |
|------------------|-----------------------------------------------------------------------------------|
| **Candidato**    | Un rectángulo posible para una pista (área, posición).                            |
| **Cascada**      | Asignación forzada porque solo queda un candidato.                                |
| **Forward-check**| Verificar que tras una decisión, todas las pistas siguen viables.                 |
| **MRV**          | "Minimum Remaining Values": procesar primero las pistas con menos opciones.       |
| **Backtrack**    | Deshacer la última decisión y probar la siguiente.                                |
| **DLX**          | Algoritmo de cobertura exacta de Knuth — aquí solo para verificar.                |
| **Trace**        | Secuencia de eventos que emite el solver, usada para pintar el paso a paso.       |
| **Precomputo**   | Búsqueda silenciosa que arranca al entrar a un mapa difícil/experto.              |
