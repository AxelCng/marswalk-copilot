# Plan de trabajo: copiloto LLM listo para la demo

**Proyecto:** MarsWalk Copilot (NASA Space Apps 2026)
**Fecha:** sábado 14 de noviembre de 2026, noche
**Alcance:** todo lo que falta para que las 3 preguntas de la demo funcionen desde el chat, con el modelo, contra el motor real y con el `graph.json` real.

---

## 1. Dónde estamos

| Pieza | Estado | Fuente |
| --- | --- | --- |
| Agente (`llm/agent.py`) y sus 5 herramientas | Listo. No inventa cifras: revisa cada número y, si hace falta, responde con un resumen hecho por código | `llm/README.md` |
| Modelo | `qwen2.5:3b` en Ollama: 6/6 chequeos, 0 números sin fuente | `llm/README.md` |
| Velocidad | **~47 s por pregunta en CPU** (~3.5 min la demo). El spec pide la demo en < 1 min | `llm/README.md` |
| `/chat` en la API real | **No está montado** en `engine/main.py`. Hoy solo funciona con el mock de Manuel (puerto 8001) | `engine/main.py` |
| Motor con el grafo real | El motor carga `contracts/graph_fake.json` salvo que se pase `GRAPH_PATH` | `engine/main.py:86` |
| Pregunta 2 de la demo con el grafo real | **No funciona**: ninguna estación queda bloqueada a 15°, así que "¿y si acepto 20°?" no cambia nada | `data/HALLAZGO_pendiente_demo.md` |
| UI (`web/ui`) | Lista: chat con manejo de error, espera larga y acceso al Plan B; probada contra el motor real | PR #4 |

**Tres bloqueos:** (1) la velocidad del modelo, (2) `/chat` no está en el motor, (3) la pregunta 2 no tiene sentido con el terreno real.

---

## 2. Decisiones que hay que tomar primero

Sin estas dos, el resto del trabajo puede tener que rehacerse.

### D1 · Dónde corre el modelo · decide Manuel (integrador final) · corte: dom 09:00

Meta: **≤ 20 s por pregunta** (3 preguntas en ~1 min).

| Opción | Velocidad esperada | Coste / riesgo |
| --- | --- | --- |
| A. Ollama en una laptop **con GPU** | La meta parece alcanzable, pero hay que medirla | Hay que tener esa laptop en la demo y en la grabación |
| B. **API comercial** para la demo; Ollama como "modo offline" en la presentación | Rápida | Es el plan B del spec. Necesita clave y cambiar el cliente en `agent.py` |
| C. Seguir en CPU con `qwen2.5:3b` | ~47 s por pregunta | La demo en vivo no entra en 1 min. Solo sirve si el video se edita |

### D2 · Qué pregunta 2 usamos con el grafo real · deciden Pedro + Jeicoll (`params.yaml`) + Manuel · corte: sáb 22:00

Opciones de `data/HALLAZGO_pendiente_demo.md`:

| Opción | Efecto |
| --- | --- |
| **A. Límites 8° y 12°** (recomendada por Pedro) | A 8° E2 y REF quedan fuera; a 12° entra E2. Cambia `limites_pendiente_deg` en `params.yaml` y se regenera `graph.json` |
| D. Cambiar la pregunta 2 por una de **tiempo** ("¿y si tengo 3 horas?") | Cero riesgo técnico, pero se pierde el contraste de pendiente |

> La pregunta 3 (polvo en Z2) **sí** funciona con el grafo real: las alertas cambian la ruta.

---

## 3. Tareas

Las horas siguen el cronograma del spec: hito sábado 22:00, Said congela el backend el domingo a las 15:00 y la primera toma del video es el domingo a las 14:00.

### Fase 1 · Backend (sábado noche → domingo 12:00)

| # | Tarea | Dueño | Depende de | Hecho cuando |
| --- | --- | --- | --- | --- |
| 1 | Montar `/chat` en el motor: `from llm.router import router as chat_router` y `app.include_router(chat_router)` en `engine/main.py` | Said | — | `POST http://127.0.0.1:8000/chat` responde. Ya se probó con un lanzador local: importa bien desde la raíz del repo |
| 2 | Arrancar el motor con el grafo real: `GRAPH_PATH=data/out/graph.json` (o cambiar el valor por defecto) | Said + Jeicoll | D2 | `/estaciones` y `/mision` devuelven datos con `meta.fake = false` |
| 3 | Si D2 = A: `limites_pendiente_deg: [8, 12, …]` en `params.yaml` y regenerar `graph.json` | Jeicoll (`params.yaml`) + Pedro | D2 | A 8° E2 sale en `omitidas` por pendiente y a 12° entra |
| 4 | `llm/.env`: `API_URL=http://127.0.0.1:8000`. Con `localhost`, en Windows una prueba se colgó intentando IPv6 | Manuel | 1 | Las herramientas llaman al motor real sin demoras |

### Fase 2 · Modelo (domingo 09:00 → 12:00)

| # | Tarea | Dueño | Depende de | Hecho cuando |
| --- | --- | --- | --- | --- |
| 5 | Dejar el modelo andando donde se decidió en D1 (descargar el modelo o configurar la API) | Manuel | D1 | `GET /chat/estado` muestra el modelo correcto |
| 6 | Precalentar el modelo antes de la demo (una pregunta de prueba, o `keep_alive` de Ollama) para que la primera respuesta no cargue el modelo en vivo | Manuel | 5 | La primera pregunta tarda lo mismo que las siguientes |
| 7 | Ajustar `PENDIENTE_DEFAULT` y `TIEMPO_DEFAULT` a la demo elegida (si D2 = A, la pendiente por defecto ya no es 15) | Manuel | D2 | El agente usa los valores nuevos cuando el astronauta no los dice |
| 8 | Actualizar `llm/test_preguntas.py`: frases y valores esperados con el grafo real (hoy espera 15°/20° y valores del grafo falso) | Manuel | 2, 3 | 6/6 chequeos y 0 números sin fuente contra el motor real |
| 9 | Correr las "10 preguntas de prueba" del spec y medir el tiempo de cada una | Manuel | 5, 8 | Tabla de resultados en `llm/README.md`, con tiempos ≤ meta de D1 |

> `detectar_cambio` en `agent.py` ya toma cualquier número de grados u horas del mensaje, así que "¿y si acepto hasta 12°?" funciona sin cambiar código.

### Fase 3 · UI y demo (domingo 11:00 → 14:00)

| # | Tarea | Dueño | Depende de | Hecho cuando |
| --- | --- | --- | --- | --- |
| 10 | Ajustar los botones "Guion demo" del chat y las preguntas del Plan B a la demo final (si D2 = A: 8° / 12° en vez de 15° / 20°; el selector de pendiente del Plan B también) | Axl | D2 | Los 3 botones mandan las frases finales |
| 11 | Revisar que la pregunta 1 entre en el tiempo pedido: con el grafo real la misión óptima de la cima es de ~200 min, y la frase actual dice "volver en menos de 3 horas" (180 min) | Axl + Manuel | 2 | La frase y el resultado del motor coinciden en el guion |
| 12 | Prueba de punta a punta: UI → `/chat` → motor real → mapa y visor, con las 3 preguntas | Axl + Manuel | 1, 4, 5 | Las 3 dan ruta en el mapa y el chip del visor dice **API** |
| 13 | Si el modelo corre en otra laptop: apuntar la UI con `VITE_API_BASE=http://<ip>:8000` | Axl | 12 | La UI de la laptop de la demo habla con ese motor |
| 14 | Guion final con los números reales (minutos, margen y estación agregada salen de la prueba 12, no de `contracts/ejemplos/`) | Axl + Jeicoll | 12 | Ningún número del guion contradice lo que se ve en pantalla |

### Fase 4 · Congelar (domingo 14:00 → 15:00)

| # | Tarea | Dueño | Hecho cuando |
| --- | --- | --- | --- |
| 15 | Primera toma del video **en local**, por si se cae internet | Axl + Jeicoll | Toma grabada con el chat real |
| 16 | Backend congelado: después de esto, solo fixes críticos | Said | 15:00 |
| 17 | Ensayar el respaldo: si el modelo falla en vivo, Plan B → mismas 3 preguntas | Axl | El Plan B da las mismas rutas que el chat |

---

## 4. Riesgos

| Riesgo | Señal | Respuesta |
| --- | --- | --- |
| El modelo sigue lento | > 20 s por pregunta en la prueba 9 | Opción B de D1, o grabar la demo y editar los tiempos de espera |
| Ollama no está en la laptop de la demo | `/chat` responde con `error` | La UI ya ofrece "Abrir Plan B"; el Plan B usa el mismo motor |
| La pregunta 2 no muestra contraste | La misión es igual con los dos límites | Decisión D2; en último caso, la opción D (pregunta de tiempo) |
| Los ejemplos de `contracts/` no coinciden con el grafo real | Sin motor, la UI muestra los números del grafo falso | Ya están marcados como "ejemplo". Para el video, usar siempre el motor real |
| Respuestas en inglés para el video | La pregunta en inglés falla | Está en `test_preguntas.py` ("ingles"); revisarla en la prueba 9 |

---

## 5. Lista de "listo para la demo"

- [ ] D1 y D2 decididas y avisadas en el grupo
- [ ] `/chat` montado en `engine/main.py` y motor con `data/out/graph.json`
- [ ] `llm/.env` con `API_URL=http://127.0.0.1:8000` y el modelo elegido
- [ ] `test_preguntas.py` 6/6 contra el motor real, con tiempos medidos
- [ ] Botones de la UI con las frases finales
- [ ] Prueba de punta a punta: chat → mapa → visor, chip **API**
- [ ] Guion con los números reales
- [ ] Primera toma del video (dom 14:00)
- [ ] Plan B ensayado como respaldo
