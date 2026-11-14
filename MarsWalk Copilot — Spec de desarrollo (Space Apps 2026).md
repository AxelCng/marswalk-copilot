# MarsWalk Copilot — Spec de desarrollo (Space Apps 2026)

Nov 14, 2026 · @Mel

MarsWalk Copilot planifica caminatas de astronautas en el cráter Jezero: un motor de grafos calcula la ruta óptima entre 6 a 8 estaciones y un LLM traduce el pedido y explica el resultado. El LLM nunca calcula; cada número que dice sale de una llamada a función.

## Equipo y laptops

Seis personas, seis laptops y una regla: cada persona tiene su laptop, una carpeta del repo y una entrega clave. Hitos: el sábado a las 22:00 se pide una misión por API y se dibuja en el mapa; el domingo a las 21:00 se entrega, antes del cierre de las 23:59.

| Persona | Rol | Laptop | Carpeta del repo | Entrega clave |
| --- | --- | --- | --- | --- |
| Jeicoll | Líder técnico y DevOps: repo, contratos, `graph_fake.json`, estaciones, Docker, despliegue e integración | L6 | `contracts/` y raíz | `graph_fake.json` en la primera hora; `estaciones.csv`; demo desplegada |
| Pedro | Datos geoespaciales: descargas, recorte, reproyección, mapa de costo y aristas | L1 | `data/` | `graph.json` real |
| Said | Backend: FastAPI, networkx, OR-Tools y test contra fuerza bruta | L2 | `engine/` | API estable |
| Manuel | IA/LLM: Ollama, tool calling, prompt de sistema y `/chat` | L3 | `llm/` | Chat que llama funciones |
| Añe | Frontend A: mapa MapLibre, nodos, aristas, ruta resaltada y animación de alerta | L4 | `web/map/` | Pantalla de la demo |
| Axl | Frontend B: panel de chat, fichas de estación, modo HUD y formulario plan B | L5 y celular | `web/ui/` | Panel de chat y fichas |

- **Datos primero: Pedro es el cuello de botella del sábado, así que Jeicoll le deja los rasters y avanza con repo, contratos y estaciones**. Jeicoll hace repo, contratos y estaciones mientras Pedro procesa los rasters.
- **Frontend sin choques:** Añe y Axl trabajan en carpetas distintas (`web/map/` y `web/ui/`) y en ramas distintas, para no pisarse en git.
- **Said** ayuda a Pedro con datos geoespaciales el sábado por la mañana si el motor va adelantado.
- **Manuel** es el integrador final: decide si algo entra o no a la demo.
- **Narrativa, guion, video y página Project en inglés:** Jeicoll y Axl el domingo; Añe aporta las capturas.
- **Pendiente:** confirmar quién es el compañero de Estadística, que revisa `params.yaml` y el test de optimalidad desde la laptop que esté libre.
- **Reglas del repo:** cada persona toca solo su carpeta; los contratos viven en `contracts/` y solo se cambian avisando en el grupo.

## Cómo se desbloquean entre sí

&#91;embedded content: dependencias · 6 personas, 1 archivo que desbloquea\]

Jeicoll sube el `graph_fake.json` en la primera hora y Said, Manuel, Añe y Axl avanzan contra él sin esperarse. Pedro entrega el `graph.json` real al motor el sábado a las 22:00; nadie cambia código, solo el archivo.

## Datos y fuentes

Todo lo crítico sale de 3 descargas: el zip del mapa geológico USGS SIM 3464 (trae DTM CTX y THEMIS día/noche), el mapa de pendientes de Jezero y el GeoJSON de waypoints de Perseverance. El área es un recorte de pocos km² sobre la ruta real de Perseverance (fondo del cráter cerca del aterrizaje + frente del delta, a confirmar). Responsable de todas las capas críticas: Pedro.

| Capa | Tipo | Fuente | Uso en el sistema | Prioridad |
| --- | --- | --- | --- | --- |
| DTM CTX 20 m | Topográfico | SIM 3464 database (zip \~350 MB) | Elevación y pendiente del mapa de costo | Crítica |
| Pendientes Jezero | Topográfico | USGS slope map (42 MB) | Pendiente ya calculada; atajo si la DTM da problemas | Crítica |
| THEMIS IR día/noche | Térmico | SIM 3464 database | Proxy de roca vs arena fina: encarece aristas | Crítica |
| Unidades geológicas | Geológico | SIM 3464 database (shapefile) | Valor científico de nodos y tipo de suelo de aristas | Crítica |
| Waypoints de Perseverance | Posición + sol | M20\_waypoints.json | Elegir estaciones reales y cruzar con fotos | Crítica |
| Fotos Navcam / Mastcam-Z | Óptico de superficie | Perseverance Raw Images | Ficha de cada estación (vista en primera persona) | Alta |
| Ortoimagen HiRISE / teselas | Óptico orbital | Mars Trek WMTS u ortho HiRISE 25 cm | Mapa base del frontend | Alta |
| DTM HiRISE 1 m | Topográfico | USGS Mars 2020 HiRISE DTM | Detalle de pendiente en un recorte pequeño | Opcional |
| Radiación | Modelado | Supuesto declarado (no hay RAD en Jezero) | Dosis base configurable × blindaje del terreno | Media |
| Polvo | Simulado | Alerta manual en la demo | Elimina o encarece aristas | Media |

La ruta propuesta de Curiosity es un GIF y sirve solo como referencia de diseño del mapa de ruta. NASA Worldview es de la Tierra y no se usa.

**Proyección:** los rasters del SIM 3464 están en Mars Transverse Mercator, meridiano central 77.5°E, esfera de 3 396 190 m. Los waypoints vienen en lon/lat y se reproyectan con `pyproj` antes de cruzarlos.

## Arquitectura y contratos

Cuatro módulos se comunican solo por dos contratos: el archivo `graph.json` y la API de FastAPI. Si los dos se fijan en la hora 0, cada laptop avanza sin esperar a las demás. El motor es el corazón: si el LLM falla, el frontend llama a la misma API desde un formulario.

| Módulo | Dueño | Produce | Consume |
| --- | --- | --- | --- |
| Pipeline de datos (`data/`) | Pedro | `graph.json` | Descargas NASA/USGS |
| Motor y API (`engine/`) | Said | API FastAPI | `graph.json` |
| LLM (`llm/`) | Manuel | `/chat` | API (vía herramientas) |
| Frontend (`web/`) | Añe y Axl | Pantalla de la demo | API y `/chat` |

### Contrato 1: graph.json (dueño: Pedro; el falso lo sube Jeicoll en la primera hora)

Lo genera el pipeline de datos y lo lee el motor al arrancar. Mientras no haya datos reales se usa uno falso con la misma forma.

```json
{
  "meta": {"area": "jezero_aoi_v1", "crs": "MTM 77.5E", "modelo_costo": "v1"},
  "nodes": [{
    "id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
    "lon": 77.40, "lat": 18.45,
    "valor_cientifico": 8, "tarea": "Muestreo de capas", "permanencia_min": 30,
    "unidad_geologica": "...",
    "capas": {"elev_m": 0, "pendiente_deg": 0, "themis_noche": 0},
    "fotos": [{"url": "...", "camara": "NAVCAM_LEFT", "sol": 0}]
  }],
  "edges": [{
    "origen": "HAB", "destino": "E1",
    "distancia_m": 0, "tiempo_min": 0, "energia_rel": 0,
    "pendiente_max_deg": 0, "dosis_rel": 0,
    "cobertura_com_pct": 0, "sombra_pct": 0,
    "zonas": ["Z1"], "geometria": [[77.45, 18.44], [77.40, 18.45]]
  }]
}
```

- Tipos de nodo: `habitat`, `rover`, `ciencia`, `muestreo`, `refugio`, `comms`.
- Las aristas son dirigidas: con 8 nodos son 56, porque subir y bajar cuestan distinto. La geometría se calcula una vez por par y se invierte.
- `zonas` lista las zonas que cruza la arista; la alerta de polvo trabaja sobre eso.

### Contrato 2: API FastAPI (dueño: Said)

| Método | Ruta | Entrada | Salida |
| --- | --- | --- | --- |
| GET | `/estaciones` | — | lista de nodos (id, nombre, tipo, valor, coordenadas) |
| GET | `/estaciones/{id}` | — | nodo completo con capas y fotos |
| POST | `/ruta` | origen, destino, pendiente\_max | tramos + totales |
| POST | `/mision` | estaciones\[\], tiempo\_max\_min, pendiente\_max, modo (tsp u orientacion) | ruta, tramos, omitidas con motivo, totales |
| POST | `/alerta` | zona, tipo (polvo o comms) | misión recalculada + aristas afectadas |
| POST | `/reset` | — | quita alertas |
| POST | `/chat` | mensaje, historial | respuesta, llamadas hechas, ruta (si hubo) |

Respuesta de `/mision` (la misma forma para `/ruta` y `/alerta`):

```json
{
  "factible": true,
  "ruta": ["HAB", "E1", "E3", "HAB"],
  "tramos": [{"origen": "HAB", "destino": "E1", "distancia_m": 0,
              "tiempo_min": 0, "pendiente_max_deg": 0, "cobertura_com_pct": 0}],
  "omitidas": [{"id": "E2", "motivo": "pendiente",
                "detalle": {"pendiente_max_deg": 19, "limite": 15}}],
  "totales": {"distancia_m": 0, "tiempo_min": 0, "dosis_rel": 0, "margen_min": 0}
}
```

`omitidas` con su motivo permite al LLM decir "omití E2 porque..." sin inventar. Los contratos viven en `contracts/` y solo se cambian avisando en el grupo.

## Herramientas del LLM

Manuel construye 5 herramientas, cada una llama a un endpoint de Said; el LLM nunca recibe el grafo completo.

| Herramienta | Endpoint | Cuándo la usa |
| --- | --- | --- |
| `listar_estaciones()` | GET `/estaciones` | Para mapear nombres que dice el astronauta a ids |
| `info_estacion(id)` | GET `/estaciones/{id}` | "¿Qué hay en E3?" |
| `ruta_punto_a_punto(origen, destino, pendiente_max)` | POST `/ruta` | "¿Cómo llego de A a B?" |
| `optimizar_mision(estaciones, tiempo_max_min, pendiente_max)` | POST `/mision` | Misiones con varias estaciones o tiempo límite |
| `recalcular_por_alerta(zona, tipo)` | POST `/alerta` | Alertas de polvo o pérdida de comunicación |

**Prompt de sistema:** responder en español o inglés según el usuario, llamar siempre a una herramienta antes de dar cifras, citar solo números devueltos por las herramientas y explicar cada estación omitida con su motivo.

**Demo final (menos de 1 minuto, 3 preguntas):**

1. Pedir una misión: "Quiero visitar el frente del delta y dos puntos de muestreo, volver en menos de 3 horas, sin pendientes de más de 15°".
2. Cambiar una restricción: "¿Y si acepto hasta 20°?" → el sistema agrega una estación y dice cuánto tiempo suma.
3. Lanzar una alerta: "Alerta de polvo en la zona X" → recalcula y explica qué tramo evitó.

Las frases exactas se ajustan cuando tengamos las estaciones reales.

## Modelo de costo y algoritmos

Cada celda del raster tiene un costo en minutos con traje; las celdas por encima del límite de pendiente quedan bloqueadas. Pedro implementa el costo en `data/`; Said implementa los algoritmos en `engine/`. Todos los factores son parámetros en un solo archivo `params.yaml`, y los que no vienen de datos NASA se presentan como supuestos.

```latex
c = \frac{\Delta x}{v(\theta)} \cdot f_{\text{terreno}} \cdot f_{\text{alerta}}, \qquad c = \infty \text{ si } \theta > \theta_{\max}
```

| Término | De dónde sale | Nota |
| --- | --- | --- |
| Δx | Tamaño de celda de la DTM | 20 m con CTX; menos si usamos HiRISE |
| v(θ) | Función de Tobler × factor\_traje | Tobler es una fórmula de caminata en la Tierra; factor\_traje es supuesto |
| f\_terreno | THEMIS noche + unidad geológica | Roca expuesta (caliente de noche) y arena fina (fría) suben el costo |
| f\_alerta | Zonas con alerta activa | 1 normal; infinito si la zona se cierra |
| θ\_max | Límite físico configurable | Supuesto; la restricción del astronauta se aplica después |

Función de Tobler (velocidad en km/h, pendiente como tangente):

```latex
v(\theta) = 6 \, e^{-3.5 \, |\tan\theta + 0.05|} \cdot \text{factor\_traje}
```

### Atributos de cada arista (Pedro)

Se calculan sobre las celdas del camino que devuelve `route_through_array(costo, inicio, fin, fully_connected=True, geometric=True)`.

- `distancia_m`: suma de pasos (diagonal = Δx · √2).
- `tiempo_min`: suma del costo; se calcula en los dos sentidos porque subir y bajar no cuestan igual.
- `pendiente_max_deg`: máximo de pendiente en el camino.
- `energia_rel`: índice relativo (tiempo × (1 + k · pendiente)), no kcal reales.
- `dosis_rel`: tiempo expuesto × (1 − blindaje). El blindaje es la fracción de cielo tapada por el relieve, calculada con la DTM en 8 azimuts. Es un modelo, no una medición.
- `cobertura_com_pct`: % de celdas del camino con línea de visión al hábitat o a un nodo comms (rayo sobre la DTM).
- `sombra_pct`: % de celdas en sombra para una hora del día fija (hillshade). Opcional.
- `zonas`: zonas de alerta predefinidas que cruza el camino.

**Truco para la pendiente del astronauta:** si solo calculamos el camino con θ\_max alto, una arista puede marcar 19° aunque exista un desvío de 14°. Por eso se precalculan 3 versiones del grafo, con límites de 15°, 20° y 25°. Con 8 nodos son 3 × 56 aristas y tarda minutos.

### Algoritmo por tipo de pregunta (Said)

| Pregunta | Problema | Implementación |
| --- | --- | --- |
| De A a B | Camino más corto | `networkx.dijkstra_path` sobre el grafo de estaciones filtrado |
| Visitar estas N en el mejor orden | TSP con inicio y fin en el hábitat | OR-Tools RoutingModel con matriz de tiempos + permanencia por nodo |
| Tengo T horas, maximiza ciencia | Problema de orientación | OR-Tools: `AddDisjunction` con penalidad = valor\_cientifico × K y dimensión de tiempo con tope T |
| Alerta de polvo en zona Z | Recalcular | Quitar aristas con Z en zonas y repetir la última misión |
| Sin comunicación | Restricción extra | Filtrar aristas con `cobertura_com_pct` bajo un umbral |

**Verificación para el jurado:** con 8 nodos, la fuerza bruta revisa todas las permutaciones (8! = 40 320) en segundos. Un test compara OR-Tools contra la fuerza bruta y lo mostramos como prueba de que la ruta es óptima.

## Cronograma del sábado 14

El sábado termina con una misión pedida por API y dibujada en el mapa a las 22:00. Los syncs duran 15 minutos y son de pie.

| Hora | Pedro | Jeicoll | Said | Manuel | Añe | Axl |
| --- | --- | --- | --- | --- | --- | --- |
| 10:00–11:00 | Baja SIM 3464, mapa de pendientes y waypoints | Repo, `contracts/` y `graph_fake.json` (desbloquea a todos) | Instala FastAPI, networkx y OR-Tools; esqueleto de la API | Instala Ollama y baja 2 modelos con tool calling | Arranca React + MapLibre | Lee el reto y los criterios; esqueleto del guion |
| 11:00–14:00 | Recorte del área y reproyección | Elige 6–8 estaciones con valor científico y tarea | `/estaciones` y `/ruta` con networkx sobre el grafo falso | Herramientas contra `graph_fake.json` (corte 13:00) | Mapa base de Jezero + nodos | Esqueleto del panel de chat y de las fichas; texto del problema y por qué Jezero |
| 14:00–17:00 | Mapa de costo y aristas en 3 versiones de pendiente | Fotos de Raw Images por sol; carga `estaciones.csv` | `/mision` con OR-Tools + test contra fuerza bruta | Las 5 herramientas + prompt de sistema | Aristas y ruta dibujadas desde `/mision` | Fichas con fotos y datos por estación (con Jeicoll) |
| 17:00–22:00 | Cobertura, dosis y zonas; entrega `graph.json` real | Fotos en `estaciones.csv`; Dockerfile; conecta el `graph.json` real | `/alerta` y `/reset` | `/chat` en FastAPI | Maqueta de la animación de alerta | Maqueta del panel de chat; borrador de la página en inglés |

- **Corte 13:00:** si Ollama no hace bien el tool calling, se activa el plan B de la sección de riesgos.
- **Corte 14:00:** si los rasters no se alinean, el costo usa solo el mapa de pendientes USGS.
- **Corte 16:00:** si MapLibre no muestra las teselas de Marte, Añe usa la ortoimagen recortada como fuente de imagen.
- **Corte 18:00:** si una estación no tiene foto cercana, se usa la del sol más cercano indicando el sol en la ficha.
- Said ayuda a Pedro con rasters el sábado por la mañana si `/estaciones` y `/ruta` van adelantados.
- **Hito 22:00:** pedir una misión por API y recibir la ruta óptima en JSON, dibujada en el mapa.

## Cronograma del domingo 15

El domingo se integra el chat, se graba el video y se entrega a las 21:00, antes del cierre de las 23:59.

| Hora | Pedro | Jeicoll | Said | Manuel | Añe | Axl |
| --- | --- | --- | --- | --- | --- | --- |
| 09:00–12:00 | Capas opcionales (sombra, HiRISE) hasta las 12:00 | Despliegue del backend (Docker) | Bugs del motor y de las alertas | Chat de punta a punta con la UI; 10 preguntas de prueba | Ruta resaltada nodo por nodo con datos reales | Chat real en el panel; guion final y storyboard |
| 12:00–15:00 | README: cómo correrlo, datos usados y créditos | Fichas y pulido; pide la clasificación en FortiGuard | Bugs; **congela el backend a las 15:00** | Formulario plan B (con Axl); ajuste del prompt | Animación de alerta y pulido visual; capturas para la página | Formulario plan B en la UI; primera toma del video a las 14:00 con Jeicoll |
| 15:00–19:00 | Revisa `params.yaml` y el test de optimalidad | Solo fixes críticos; edita el video con Axl | Solo fixes críticos | Solo fixes críticos | Solo fixes críticos | Video y página Project (textos e imágenes) |
| 19:00–21:00 | Todos | Todos | Todos | Todos | Todos | Todos: revisar la página, probar links en ventana privada y entregar |

La primera toma del video a las 14:00 se graba con todo en local, por si cae internet.

## Riesgos, cortes y plan B

Cada riesgo tiene un dueño y una hora de corte: si a esa hora no está resuelto, se activa el plan B sin discutir.

| Riesgo | Dueño | Corte | Plan B |
| --- | --- | --- | --- |
| Los rasters no se alinean o la DTM da problemas | Pedro | Sáb 14:00 | Costo solo con el mapa de pendientes USGS; THEMIS y geología se suman después |
| El modelo de Ollama no hace bien el tool calling | Manuel | Sáb 13:00 | Probar otro modelo local; si tampoco, API comercial para la demo y Ollama como "modo offline" en la presentación |
| Ninguna laptop corre Ollama con fluidez | Manuel | Sáb 13:00 | Modelo más chico o API comercial |
| MapLibre no muestra las teselas de Marte | Añe | Sáb 16:00 | Ortoimagen recortada como fuente de imagen con límites fijos (image source) |
| Una estación no tiene foto cercana | Jeicoll | Sáb 18:00 | Foto del sol más cercano, con el sol indicado en la ficha |
| Internet caído el domingo | Jeicoll | Dom 14:00 | Primera toma del video grabada a las 14:00 con todo en local |
| El LLM falla en vivo | Manuel y Axl | Siempre | Formulario con estaciones, tiempo máximo y pendiente que llama a `/mision` |

## Checklist de entrega

Todo debe quedar entregado antes de las 21:00 del domingo; el cierre es a las 23:59.

- [ ] Confirmar con el Local Lead el horario de jurado local (Jeicoll)
- [ ] Repo de GitHub público con README: cómo correrlo, datos usados y créditos (Pedro y Jeicoll)
- [ ] Demo desplegada y clasificación pedida en FortiGuard, Company Name "N/A" (Jeicoll)
- [ ] Video subido como público o no listado, probado en ventana privada (Axl y Jeicoll)
- [ ] Página Project: resumen, descripción detallada, datos NASA con links, herramientas y uso de IA (Axl)
- [ ] Capturas en JPG o PNG (hasta 10 MB) en la página (Añe)
- [ ] Créditos: NASA/JPL-Caltech, USGS, MSSS/ASU según cada imagen; ningún texto sugiere aval de NASA (Axl)
- [ ] Save Progress frecuente y candado de edición activo al editar (todos)
- [ ] Entregado antes de las 21:00 del domingo (todos)
