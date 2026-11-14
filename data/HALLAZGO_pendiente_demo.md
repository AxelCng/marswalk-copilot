# Hallazgo: la demo del spec no se sostiene con la DTM real

Fecha: sábado 14, tras calcular el grafo real con `data/`.

## Qué dice el spec

La demo tiene tres preguntas y la segunda es:

> "¿Y si acepto hasta 20°?" → el sistema agrega una estación y dice cuánto
> tiempo suma.

Eso depende de que a 15° **no** se pueda llegar a E2 (cima del delta) y a 20° sí.
El `graph_fake.json` lo cumple, porque usa una regla sintética: la pendiente de
cada arista es la peor inclinación medida por el rover en sus extremos, más ruido.
Así E2 arrastra sus 20.3° y queda bloqueada a 15°.

## Qué pasa con el terreno real

Con la DTM CTX estéreo de 20 m, **ninguna estación queda bloqueada a 15°**. Estos
son los límites mínimos medidos, probando de 3.0° a 30° en pasos de 0.5°:

| Estación | Límite mínimo para llegar desde HAB | Pendiente real del camino |
| --- | --- | --- |
| ROV | 3.0° | 2.5° |
| M1 | 3.0° | 2.5° |
| COM | 3.5° | 3.5° |
| M2 | 4.5° | 4.5° |
| E1 | 4.5° | 4.5° |
| **E2** | **8.5°** | **8.3°** |
| REF | 12.5° | 12.3° |

A 15°, 20° y 25° la misión óptima es la misma:

```
HAB → M2 → E2 → E1 → M1 → HAB      200.6 min, 7 491 m
```

Las tres versiones del grafo dan 56 aristas. No hay ninguna omitida por
pendiente. La pregunta "¿y si acepto 20°?" no cambia nada.

## Por qué

Dos razones, ambas verificadas:

1. **La subida directa es empinada, pero hay un rodeo suave.** El perfil REF→E2
   llega a 19.7° e incluso 21.3° en el peor punto de la caja, y a menos de 10°
   no hay paso. Pero entre M2 y E2 el máximo del camino es 10.5°, y existe un
   corredor de 12.26° que llega a E2. La barrera no es continua.
2. **La DTM de 20 m suaviza el relieve.** El rover midió 20.3° de inclinación en
   el sol 700, pero eso es una medición local sobre su batalla, no la pendiente
   media de un tramo de 700 m. A 20 m por píxel, un escalón de 3 m se promedia
   con sus vecinos y deja de verse.

## Qué NO es

No es un error de alineación ni de reproyección: los pasos 40 y 60 lo verifican
(estaciones sobre el raster, sin desplazamiento, malla compartida, ida ≠ vuelta).
Tampoco es un error de pendiente: p99 = 21.8° y hay 704 celdas por encima de 15°,
pero no forman una barrera entre estaciones.

## Opciones para el equipo

| Opción | Efecto en la demo | Coste |
| --- | --- | --- |
| **A. Cambiar los límites del demo** a 8° y 12° | E2 entra a 12° y no a 8°; la pregunta 2 funciona | Hay que avisar y cambiar `params.yaml` (es de Jeicoll) |
| **B. Usar la inclinación medida por el rover como restricción del nodo** | E2 queda bloqueada con el dato real del sol 700 | Es un dato NASA, no un invento; pero no es "pendiente del camino" |
| **C. Bajar un DTM HiRISE de 1 m para el corredor REF↔E2** | El relieve real aparece | Descarga y tiempo; el spec lo lista como opcional |
| **D. Cambiar la pregunta 2 de la demo** por una que sí funcione (p. ej. el límite de tiempo) | Cero riesgo técnico | Se pierde el contraste de pendiente |

**Recomendación:** A para el demo de pendiente, con 8° y 12°. Es el único cambio
que mantiene la historia ("con más pendiente entras a la cima") y usa el terreno
real. Si se prefiere no tocar `params.yaml`, entonces D.

Los números de la opción A, medidos con este grafo:

| Límite | Aristas de 56 | Estaciones alcanzables desde HAB |
| --- | --- | --- |
| 8° | 30 | ROV, E1, M1, M2, COM — **E2 y REF quedan fuera** |
| 10° | 42 | + E2 |
| 12° | 42 | + E2 |
| 15° | 56 | + REF (todo conectado) |

Con 8° y 12° la pregunta 2 del demo vuelve a funcionar: a 8° no se llega a la
cima, a 12° sí, y el sistema puede decir cuánto tiempo suma. El salto útil está
entre 8° y 10°, así que 8/12 deja margen.

## Mientras tanto

El `graph.json` real se genera con los tres límites de `params.yaml` (15/20/25),
sin omitidas por pendiente. Es correcto y el motor lo acepta: misión de 229.8 min
en `engine.check_graph`. Las alertas de polvo **sí** cambian la ruta, así que la
pregunta 3 de la demo funciona.
