# Estaciones: por qué estas 8 y de dónde sale cada dato

Este documento justifica cada elección de [`estaciones.csv`](estaciones.csv). Cada dato es de uno de tres tipos:

- **[DATO NASA]**: sale tal cual de un archivo o página oficial de NASA/JPL.
- **[VERIFICADO]**: lo inferimos de los datos y lo confirmamos con una fuente publicada.
- **[SUPUESTO]**: lo decidimos nosotros para la simulación. Se presenta como supuesto ante el jurado, como pide el spec.

## Método

1. **[DATO NASA]** Se bajaron los 708 waypoints oficiales de Perseverance (soles 13 a 2022) de `M20_waypoints.json` (JPL). Cada uno trae sol, lon/lat, elevación e inclinación del rover.
2. Se filtraron los 278 waypoints del área de estudio del spec, el fondo del cráter cerca del aterrizaje y el frente del delta: lon 77.37–77.47°E, lat 18.41–18.48°N.
3. Se buscaron **los lugares donde el rover se quedó muchos soles sin moverse**. Una estadía larga indica trabajo científico (abrasión, núcleo de muestra, análisis).
4. Cada estadía se cruzó, sol por sol, con la [tabla oficial de muestras de NASA](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples) y con los comunicados de cada campaña. **Las 4 estaciones científicas coinciden con un registro oficial.**
5. Las 4 estaciones de apoyo (hábitat, rover, refugio, repetidora) son elementos de una misión tripulada ficticia, ubicados en waypoints reales elegidos por su función.

## Por qué 8 estaciones y por qué estas

- **El spec pide 6 a 8 estaciones** y los tipos `habitat`, `rover`, `ciencia`, `muestreo`, `refugio` y `comms`. Con 8 hay uno de cada tipo de apoyo y 4 científicas.
- **Cubren las 3 campañas científicas de Perseverance dentro del área:** fondo del cráter (Séítah), frente del delta (Amalik y Three Forks) y cima del delta (Upper Fan). Así la demo cuenta la historia geológica real de Jezero: roca ígnea del fondo → sedimentos del lago → abanico superior.
- **Distancias caminables:** la estación más lejana (la cima del delta) está a 2.9 km del hábitat en línea recta. Encaja en "un recorte de pocos km²" que pide el spec.
- **La demo necesita una estación que solo se alcance con más pendiente.** La cima del delta cumple esto con un dato medido: el rover llegó a 20.3° de inclinación al subir (sol 700).

## Estación por estación

### HAB — Hábitat Octavia E. Butler
- **Dónde:** sitio de aterrizaje de Perseverance (18 de febrero de 2021). Waypoint del sol 13: 77.45089°E, 18.44463°N, −2570 m. **[DATO NASA]**
- **Verificación:** NASA ubica el sitio en 18.44°N 77.45°E, y lo nombró en honor a la escritora Octavia E. Butler. **[VERIFICADO]** ([JPL PIA24483](https://www.jpl.nasa.gov/images/pia24483-welcome-to-octavia-e-butler-landing/), [Wikipedia](https://en.wikipedia.org/wiki/Octavia_E._Butler_Landing))
- **Por qué acá:** NASA eligió este lugar como seguro para aterrizar (terreno plano: el rover midió 1.2° de inclinación). Es el lugar lógico para un hábitat.
- **Valor 0, permanencia 0:** es el origen y fin de la misión, no un objetivo. **[SUPUESTO]**

### E1 — Frente del delta, afloramiento Amalik
- **Dónde:** waypoint del sol 565: 77.40144°E, 18.45073°N, −2527 m. **[DATO NASA]**
- **Verificación:** NASA tomó acá dos núcleos de roca sedimentaria del afloramiento **Amalik**: Shuyak (sellado el sol 575) y Mageik (tomado el sol 579). Según los waypoints, el rover no se movió entre los soles 557 y 592. NASA ubica Amalik "en la región de Enchanted Lake, en la base del delta de Jezero". **[VERIFICADO]** ([tabla de muestras](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples), [blog de NASA sobre Amalik](https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/))
- **Por qué es importante:** el frente del delta guarda los sedimentos de un antiguo lago, que es el ambiente con más chance de preservar señales de vida pasada. Es la razón por la que Perseverance fue a Jezero. ([Mangold et al. 2021, *Science*, doi:10.1126/science.abl4051](https://earthsky.org/space/ancient-martian-lake-delta-floods-perseverance/))
- **Valor 9:** el más alto, porque es el objetivo central de la misión real. **[SUPUESTO con fundamento]**
- **Nota:** las fuentes de NASA no coinciden en el sol de Mageik (el blog dice sol 579, la tabla dice sellado el sol 619). Puede que la muestra se haya tomado en el 579 y sellado en el 619. No cambia la ubicación.

### M1 — Séítah sur, afloramiento Brac
- **Dónde:** waypoint del sol 248: 77.44302°E, 18.43396°N, −2569 m. **[DATO NASA]**
- **Verificación:** NASA tomó acá dos núcleos del afloramiento **Brac** en "South Séítah": Salette (sol 262) y Coulettes (sol 271). Según los waypoints, el rover no se movió entre los soles 248 y 278. **[VERIFICADO]** ([tabla de muestras](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples))
- **Por qué es importante:** Brac es una roca ígnea formada por cristales de olivino que se acumularon en el fondo de una cámara de magma (un "cumulado de olivino"). Sirve para fechar el cráter y para entender cómo la roca se alteró con agua. ([Liu et al. 2022, *Science* 377:1513](https://ntrs.nasa.gov/api/citations/20220012767/downloads/Liu%20et%20al.%202022%20olivine%20cumulate%20Seitah%20science.abo2756.pdf))
- **Valor 8:** alto, pero un punto menos que el delta porque es roca ígnea (cronología) y no sedimento de lago (habitabilidad). **[SUPUESTO con fundamento]**
- **Inclinación 12.3°:** la más alta medida por el rover en esa estadía (sol 238). Séítah es terreno irregular. **[DATO NASA]**

### M2 — Depósito de muestras Three Forks
- **Dónde:** waypoint del sol 693: 77.40844°E, 18.45342°N, −2545 m. **[DATO NASA]**
- **Verificación:** NASA armó el depósito entre el **sol 653** (21 de diciembre de 2022) y el **sol 690** (28 de enero de 2023), "en terreno plano cerca de la base del delta", con 10 tubos en zigzag separados 5 a 15 m. Los waypoints muestran justo eso: avances de pocos metros entre los soles 652 y 693, en terreno plano (1.6° como máximo). **[VERIFICADO]** ([JPL PIA25682](https://www.jpl.nasa.gov/images/pia25682-perseverances-three-forks-sample-depot-map/))
- **Por qué es importante:** es el respaldo del retorno de muestras a la Tierra. Si el rover falla, una misión futura recoge estos tubos.
- **Valor 7:** su importancia es estratégica, no científica nueva: los tubos ya están tomados. La tarea "verificar tubos" es una actividad creíble para una misión tripulada. **[SUPUESTO]**

### E2 — Cima del delta (Upper Fan)
- **Dónde:** waypoint del sol 709: 77.40293°E, 18.46167°N, −2497 m. Está 48 m más alto que el depósito. **[DATO NASA]**
- **Verificación:** la campaña **Upper Fan** (la tercera de la misión) empieza en el **sol 708**, cuando el rover llega arriba del frente del abanico. **[VERIFICADO]** ([blog de NASA sobre Upper Fan](https://science.nasa.gov/blog/up-and-soon-away-perseverance-continues-exploring-the-upper-fan/))
- **Por qué es importante:** la cima tiene los sedimentos más jóvenes del abanico. Comparados con los del frente, muestran cómo cambió el agua en el tiempo.
- **La pendiente (clave para la demo):** en la subida (soles 698–709), el rover midió **20.3° de inclinación en el sol 700**. **[DATO NASA]** Por eso, con un límite de 15° la cima no se puede alcanzar y con 20° sí: no es un truco nuestro.
- **Valor 8:** importante, pero en este punto exacto no se tomó un núcleo (la primera muestra del Upper Fan, Melyn, es del sol 749 y está más adelante). **[SUPUESTO con fundamento]**
- **Pendiente:** un abstract de GSA 2023 describe la subida por "Beagle Gap". No confirmamos si nuestros waypoints de los soles 698–707 corresponden a ese tramo, así que no usamos ese nombre.

### REF — Refugio en la base de Hawksbill Gap
- **Dónde:** waypoint del sol 437: 77.40875°E, 18.45710°N, −2540 m. **[DATO NASA]**
- **Verificación:** la subida por el canal Hawksbill Gap empieza en el **sol 441**, y este waypoint es la última parada antes en el mismo lugar. **[VERIFICADO]** ([NASA: Next stop Hawksbill Gap](https://science.nasa.gov/missions/mars-2020-perseverance/next-stop-hawksbill-gap/))
- **Por qué un refugio acá:** al pie del escarpe del delta, el relieve tapa parte del cielo. Eso reduce la radiación y protege del viento con polvo (es el "blindaje" que calcula el modelo de dosis del spec). Además queda a 220 m del depósito y a 425 m de la cima, en el camino de subida (distancias en línea recta). **[SUPUESTO]**

### COM — Repetidora, llanura norte
- **Dónde:** waypoint del sol 404: 77.42576°E, 18.45932°N, −2548 m. **[DATO NASA]**
- **Verificación:** es un punto del **Rapid Traverse** (soles 379–409), el traslado rápido del aterrizaje al delta. **[VERIFICADO]** ([JPL Robotics, Rapid Traverse](https://robotics.jpl.nasa.gov/media/documents/2023-rapid-traverse.pdf))
- **Por qué una repetidora acá:** queda **en el medio**, entre el hábitat (1.7 km) y el frente del delta (1.5 km), en terreno plano (distancias en línea recta). Así puede tener línea de vista con los dos. **[SUPUESTO]** La línea de vista real la calcula Pedro con la DTM.
- **La foto** es del sol 405 porque la del 404 era del Sol (deslumbrada).

### ROV — Rover de apoyo, fondo sur
- **Dónde:** waypoint del sol 135: 77.45215°E, 18.43114°N, −2580 m, en la ruta real del rover hacia el sur durante la campaña del fondo del cráter. **[DATO NASA]**
- **Por qué acá:** queda a 540 m de Séítah en línea recta, para relevar baterías y muestras en la parte sur, mientras el hábitat cubre el norte. **[SUPUESTO]**

## Criterios comunes

### Valor científico (0–10) **[SUPUESTO con fundamento]**

| Valor | Criterio | Estaciones |
| --- | --- | --- |
| 9 | NASA tomó muestras acá **y** es el ambiente de lago, el objetivo central de la misión | E1 |
| 8 | NASA tomó muestras acá (roca ígnea) o es la cima del abanico, sin muestra en ese punto | M1, E2 |
| 7 | Importancia estratégica (respaldo de muestras), sin ciencia nueva | M2 |
| 1–2 | Apoyo logístico | ROV, REF, COM |
| 0 | Origen de la misión | HAB |

### Permanencia (minutos) **[SUPUESTO]**
25 min para estratigrafía, 20 min para panorámica, 15 min para tomar o verificar muestras y 10 min para tareas de apoyo. Son valores para la simulación y están en un solo lugar, para que el compañero de Estadística los revise.

### Inclinación del rover como pendiente local **[DATO NASA, usado como aproximación]**
La columna `inclinacion_rover_max_deg` es la inclinación medida por el rover (campo `tilt` del waypoint). Mide el terreno donde estaba parado el rover, no la pendiente del camino entero. La pendiente real de cada tramo la calcula Pedro con la DTM. Mientras tanto, el grafo falso usa la inclinación como aproximación.

### Fotos **[DATO NASA]**
De la [API de Raw Images de Mars 2020](https://mars.nasa.gov/mars2020/multimedia/raw-images/). Los criterios:
- La misma estación y el mismo sol (o el siguiente).
- Navcam izquierda, cuadro completo.
- La cámara mirando un poco hacia abajo, para una vista en primera persona.
- Se descartaron a mano las fotos que mostraban sobre todo cielo, el Sol o la cubierta del rover.

Crédito: **NASA/JPL-Caltech**.

## Qué no viene de datos reales

- Los roles de hábitat, rover, refugio y repetidora (la misión tripulada es ficticia).
- El valor científico, la permanencia y las tareas.
- En `graph_fake.json`: THEMIS, la unidad geológica, las zonas de alerta y todos los atributos de las aristas. Eso lo reemplaza el `graph.json` de Pedro.

## Fuentes

- JPL, waypoints de Mars 2020: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
- NASA, tabla de muestras de Perseverance: https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples
- NASA, actividades en el afloramiento Amalik: https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/
- JPL, mapa del depósito Three Forks (PIA25682): https://www.jpl.nasa.gov/images/pia25682-perseverances-three-forks-sample-depot-map/
- NASA, Upper Fan: https://science.nasa.gov/blog/up-and-soon-away-perseverance-continues-exploring-the-upper-fan/
- NASA, Next stop Hawksbill Gap: https://science.nasa.gov/missions/mars-2020-perseverance/next-stop-hawksbill-gap/
- JPL Robotics, Rapid Traverse (2023): https://robotics.jpl.nasa.gov/media/documents/2023-rapid-traverse.pdf
- JPL, Octavia E. Butler Landing (PIA24483): https://www.jpl.nasa.gov/images/pia24483-welcome-to-octavia-e-butler-landing/
- Liu et al. 2022, *An olivine cumulate outcrop on the floor of Jezero crater, Mars*, Science 377:1513: https://ntrs.nasa.gov/api/citations/20220012767/downloads/Liu%20et%20al.%202022%20olivine%20cumulate%20Seitah%20science.abo2756.pdf
- Mangold et al. 2021, *Perseverance rover reveals an ancient delta-lake system and flood deposits at Jezero crater, Mars*, Science, doi:10.1126/science.abl4051
- Mars 2020 Raw Images: https://mars.nasa.gov/mars2020/multimedia/raw-images/
