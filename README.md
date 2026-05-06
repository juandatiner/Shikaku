# Shikaku — Cómo se resuelve el puzzle

Documentación del algoritmo del solver propio (`shikaku/js/solver_propio.js`).
Pensada para que cualquiera entienda paso a paso cómo el programa razona.

---

## 1. Las reglas del juego

Shikaku se juega sobre una grilla cuadriculada con algunos números colocados dentro.

Hay que dividir todo el tablero en **rectángulos** que cumplan tres condiciones:

1. Cada rectángulo contiene **exactamente un número**.
2. El **área** del rectángulo (`ancho × alto`) es **igual** al número que tiene dentro.
3. Los rectángulos **no se solapan** y entre todos cubren **todo** el tablero.

Ejemplo de un mapa **resuelto** de 4×4:

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

(suma de pistas = 6 + 4 + 2 + 4 = 16 = 4×4 ✓)

---

## 2. Pistas para humanos (y para el algoritmo)

Antes de mostrar el código, repasemos las **observaciones** que ayudan tanto a una persona como al solver. El programa las codifica como reglas.

### 2.1 Tabla de factorizaciones (formas posibles del 2 al 10)

Cada número se puede dibujar como rectángulo solo de tantas formas como factorizaciones tenga.

| Valor | Formas | Comentario |
|-------|--------|-----------|
| **2** | `1×2` `2×1` | Primo → siempre lineal |
| **3** | `1×3` `3×1` | Primo → siempre lineal |
| **4** | `1×4` `4×1` `2×2` | Lineal o cuadrado |
| **5** | `1×5` `5×1` | Primo → lineal |
| **6** | `1×6` `2×3` `3×2` `6×1` | 4 formas |
| **7** | `1×7` `7×1` | Primo → lineal |
| **8** | `1×8` `2×4` `4×2` `8×1` | Sin cuadrado |
| **9** | `1×9` `3×3` `9×1` | Lineal o cuadrado |
| **10** | `1×10` `2×5` `5×2` `10×1` | Sin cuadrado |

Conclusión: los **primos** (2, 3, 5, 7) son los más fáciles para empezar — solo pueden ser líneas.

### 2.2 Pistas en bordes y esquinas

Si una pista está pegada a un borde del tablero, su rectángulo está obligado a "pegarse" a ese borde (no puede flotar fuera).

```
Pista en esquina (0,0) con valor 6:
+---+---+---+---+---+---+
| 6 |   |   |   |   |   |
+---+---+---+---+---+---+

→ El rectángulo tiene que empezar en la esquina (0,0).
   Solo dos opciones quedan:  1×6 horizontal  o  6×1 vertical.
```

### 2.3 Cuadrados perfectos en el centro

Si la pista vale 4, 9, 16... y está cerca del centro, su forma natural es el **cuadrado**: 2×2, 3×3, 4×4. Lejos del centro, suele ser línea.

### 2.4 Otra pista dentro = imposible

Un rectángulo no puede comerse otra pista. Si dibujar 1×6 implica abarcar la celda donde hay un `3`, ese candidato se descarta.

### 2.5 Suma total

`Σ (valores de pistas) = filas × columnas`. Si no se cumple, el puzzle está mal definido y no tiene solución.

### 2.6 Pares e impares

- **Valor par grande** (8, 10, 12...) → puede llenar una franja entera. Mirar primero si ocupa toda una fila/columna.
- **Valor impar primo** (3, 5, 7...) → línea forzada, muy rígida. Útil para anclar.

---

## 3. El algoritmo paso a paso

El solver trabaja en **cinco fases**. Las primeras dos son preparación, las dos del medio son **propagación lógica** (no requieren probar nada), y la última es **búsqueda con vuelta atrás** sólo si lo anterior no alcanzó.

```
   ┌─────────────────────────────────────────┐
   │  Fase 1: Generar candidatos             │
   │  Fase 2: Aplicar reglas (filtrar)       │
   │  Fase 3: Cascada (forzados)             │
   │  Fase 4: Celdas obligadas               │
   │  Fase 5: Tabla DP + forward-check       │
   └─────────────────────────────────────────┘
```

---

### Fase 1 — Generar candidatos

Para cada pista, calcular **todos** los rectángulos que:
- tienen área igual al valor de la pista,
- contienen la celda de la pista,
- entran dentro del tablero.

Ejemplo: pista `6` en (0,0) en un tablero 4×4.

Formas posibles: `1×6` `6×1` `2×3` `3×2`.

Pero `1×6` no entra (el tablero solo tiene 4 columnas). Tampoco `6×1`. Quedan `2×3` y `3×2`. Ahora muevo cada forma para que **(0,0) esté adentro**:

```
2×3 cabe solo en una posición:    3×2 cabe solo en una posición:
+---+---+---+---+                 +---+---+---+---+
|###|###|###|   |                 |###|###|   |   |
+---+---+---+---+                 +---+---+---+---+
|###|###|###|   |                 |###|###|   |   |
+---+---+---+---+                 +---+---+---+---+
|   |   |   |   |                 |###|###|   |   |
+---+---+---+---+                 +---+---+---+---+
|   |   |   |   |                 |   |   |   |   |
                                  +---+---+---+---+
```

→ Pista `6` en (0,0) tiene **2 candidatos**.

---

### Fase 2 — Aplicar reglas

Tachar candidatos imposibles antes de probar nada:

| Regla | Qué descarta |
|-------|---|
| **Esquinas** | Rectángulos que no se "pegan" al borde donde está la pista. |
| **Primos** | Para 2,3,5,7,11..., descarta todo lo que no sea línea. |
| **Otra pista adentro** | Cualquier candidato que abarcaría la celda de otra pista. |
| **Cuadrado central** | (Reordena) prueba primero el cuadrado si la pista está al centro, último si está al borde. |

---

### Fase 3 — Cascada (efecto dominó)

Buscar pistas que tengan **un solo candidato** después del filtrado.

```
Pista X tiene 1 candidato       →    Asignar.
Asignar ocupa celdas            →    Otras pistas pierden candidatos
                                     que se solapaban.
Algunas quedan con 1 sola opción →    Asignar de nuevo.
Repetir hasta que nada cambie.
```

En tableros chicos (5×5, 6×6) la cascada **resuelve casi todo sola**.

---

### Fase 4 — Celdas obligadas (la más nueva, la que más poda)

**Idea clave**: cada celda del tablero **debe** ser cubierta por algún rectángulo de alguna pista. Para cada celda libre, miramos:

> ¿Quién puede taparme?

Si la respuesta es **una sola pista**, entonces esa pista está obligada a usar un candidato que cubra esta celda. Los demás candidatos suyos se descartan.

```
       col 0   col 1   col 2   col 3
row 0  ┌─────┬─────┬─────┬─────┐
       │  ?  │  ?  │     │     │
row 1  ├─────┼─────┼─────┼─────┤
       │  ?  │ pivote 9  │     │
row 2  ├─────┼─────┼─────┼─────┤
       │     │     │     │     │
       └─────┴─────┴─────┴─────┘
```

Si las celdas marcadas con `?` solo pueden ser cubiertas por candidatos del `9`, entonces el `9` está obligado a ocuparlas. Al recortar sus candidatos, despierta cascada → más pistas forzadas. Es muy potente.

**Resultado**: el bench mejoró así:
- D3-L9 (13×13): de **506 ms → 0.6 ms**
- D3-L10 (14×14): de **17.9 s → 52 ms**
- D4-L8 (23×23): de timeout → **552 ms**

---

### Fase 5 — Tabla DP + forward-check

Si todavía quedan pistas con varias opciones, hay que **probar combinaciones**.

Se construye una **tabla de decisiones** donde cada fila es un paso (una pista) y se anota qué candidato eligió.

```
        elegido
paso 0  →  candidato 2 de pista A
paso 1  →  candidato 0 de pista B
paso 2  →  candidato ?  ← buscando…
paso 3  →  ?
paso 4  →  ?
```

**MRV** (Minimum Remaining Values): se ordenan las pistas pendientes de **menos candidatos primero**. Así, si vamos a fallar, fallamos rápido.

**Forward-check**: antes de avanzar al paso siguiente, se verifica que **todas** las pistas pendientes sigan teniendo al menos un candidato libre. Si una se quedó sin opciones, se descarta este candidato y se prueba el siguiente — **sin entrar a explorar la rama muerta**.

Si en un paso ningún candidato funciona → **backtrack**: se borra la decisión, se libera la celda y se vuelve a probar el paso anterior con la siguiente opción.

```
avanzar:   paso 0 → paso 1 → paso 2  ✓ todas viables
                                ↓
                            paso 3   ✗ contradicción
                                ↑
backtrack:                  paso 2 (probar siguiente candidato)
```

Cuando se llena toda la tabla → **solución encontrada**.

---

## 4. Ejemplos por tamaño

### 4×4 (Principiante)

```
Puzzle:                Soluciones esperadas: 1
+---+---+---+---+      Tiempo solver: < 1 ms
|   |   | 6 |   |      Lo resuelve la cascada sola.
+---+---+---+---+
| 4 |   |   |   |
+---+---+---+---+
|   |   |   | 2 |
+---+---+---+---+
|   |   | 4 |   |
+---+---+---+---+
```

### 9×9 (Medio)

Tablero medio con ~16-20 pistas. La cascada y las celdas obligadas resuelven en pocos ms.

### 15×15 (Difícil)

~25-30 pistas. Mezcla de pistas chicas (2,3,4) y grandes (8,9,12). Suelen resolver en **<1 ms** porque las pistas chicas anclan el tablero rápidamente.

### 25×25 (Difícil-Experto)

Aquí empieza a depender de la distribución:
- Mucha pista chica → cascada resuelve casi todo, **<10 ms**.
- Pocas pistas grandes → más combinatoria, puede tardar segundos o necesitar la tabla DP.

### 40×40 (Experto)

Tableros enormes con 20-130 pistas. Si están densos (muchas pistas) la cascada explota y resuelve en **ms**. Si son ralos (pocas pistas grandes) la búsqueda DP puede tardar varios segundos.

---

## 5. Resultados del benchmark (50 mapas)

5 dificultades × 10 niveles. Solver con todas las fases activas, timeout 30s, hasta 5 reintentos:

```
D1 (4×4–5×5):     10/10  ·  total 1.15 ms    ·  máx 0.40 ms
D2 (6×6–8×8):     10/10  ·  total 17 ms      ·  máx 13.8 ms
D3 (9×9–14×14):   10/10  ·  total 398 ms     ·  máx 341 ms
D4 (15×15–25×25): 10/10  ·  total 59.8 s     ·  máx 30 s
D5 (26×26–40×40): 10/10  ·  total 30.8 s     ·  máx 30 s
TOTAL:            50/50  ·  acumulado 91 s
```

Antes de agregar la fase 4 (celdas obligadas): **41/50** resueltos, varios timeouts.
Después: **50/50**, los lentos son grandes con baja densidad de pistas.

---

## 6. Resumen en una frase

> **Tachar lo imposible, encadenar lo obligatorio, restringir por celdas, y probar lo poco que quede con paso atrás.**

Esa es toda la idea.

---

## 7. Mapa de archivos

```
shikaku/js/
├── solver_propio.js     ← el algoritmo (5 fases)
├── solver.worker.js     ← lo corre en un Web Worker
├── generator.js         ← crea puzzles aleatorios con solución única
├── board.js             ← UI del tablero
├── ui.js                ← UI general (modales, export)
├── maps.js              ← mapas preset (decorativos)
├── constants.js         ← config de dificultades, colores, timeouts
└── main.js              ← arranque
```

