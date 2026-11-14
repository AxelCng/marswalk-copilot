"""Genera contracts/graph_fake.json y contracts/ejemplos/*.json.

Grafo FALSO con la misma forma que el graph.json real (Contrato 1), para que
motor, LLM y frontend avancen sin esperar al pipeline de datos.
Los números son inventados pero coherentes: Tobler para el tiempo, aristas
dirigidas (subir != bajar), 3 versiones por límite de pendiente (15/20/25°).

Solo usa la biblioteca estándar. Uso (desde la raíz del repo):
    python contracts/tools/generar_graph_fake.py

Está armado para que la demo del spec funcione con datos falsos:
  1. {E1, M1, M2} en <180 min con pendiente <=15°  -> factible
  2. Con 20° se puede sumar E2 (cima del delta), bloqueada a 15°
  3. Alerta de polvo en Z2 (campo de dunas) -> el recálculo cambia de tramos
"""
from __future__ import annotations

import itertools
import json
import math
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SALIDA_GRAFO = RAIZ / "contracts" / "graph_fake.json"
SALIDA_EJEMPLOS = RAIZ / "contracts" / "ejemplos"

R_MARTE = 3_396_190.0          # esfera del SIM 3464 (m)
LIMITES = [15, 20, 25]         # versiones precalculadas del grafo
DESVIO_MAX_DEG = 3.0           # si la pendiente directa excede el límite en <=3°, hay desvío
FACTOR_TRAJE = 0.80            # supuesto (mismo valor que params.yaml)
K_ENERGIA = 0.05               # energia_rel = tiempo * (1 + k * pendiente)
TORTUOSIDAD = 1.08             # el camino real no es la polilínea perfecta

# ---------------------------------------------------------------- nodos
# REALES: lon, lat y elev_m salen de waypoints de Perseverance (M20_waypoints.json),
# y pendiente_local_deg es la inclinación máxima medida por el rover en ese lugar.
# FAKE: themis_noche_K, unidad_geologica, f_terreno (los reemplaza el pipeline de data/).
# Ver estaciones.csv para el sol de cada waypoint.
# id, nombre, tipo, lon, lat, elev_m, pendiente_local_deg, themis_noche_K,
# valor_cientifico, tarea, permanencia_min, unidad_geologica, f_terreno
NODOS = [
    ("HAB", "Hábitat Octavia E. Butler", "habitat", 77.45089, 18.44463, -2570, 1.2, 205, 0,
     "Base de la misión", 0, "Fondo del cráter, Máaz (FAKE)", 1.00),
    ("ROV", "Rover de apoyo, fondo sur", "rover", 77.45215, 18.43114, -2580, 7.3, 208, 2,
     "Relevo de baterías y muestras", 10, "Fondo del cráter, Máaz (FAKE)", 1.00),
    ("E1", "Frente del delta, afloramiento Amalik", "ciencia", 77.40144, 18.45073, -2527, 8.1, 222, 9,
     "Estratigrafía de capas sedimentarias", 25, "Delta, frente (FAKE)", 1.20),
    ("M1", "Séítah sur, afloramiento Brac", "muestreo", 77.44302, 18.43396, -2569, 12.3, 230, 8,
     "Núcleo de roca ígnea rica en olivino", 15, "Séítah (FAKE)", 1.15),
    ("M2", "Depósito de muestras Three Forks", "muestreo", 77.40844, 18.45342, -2545, 1.6, 214, 7,
     "Verificar tubos del depósito", 15, "Fondo del cráter, base del delta (FAKE)", 1.05),
    ("E2", "Cima del delta (Upper Fan)", "ciencia", 77.40293, 18.46167, -2497, 20.3, 225, 8,
     "Estratigrafía y panorámica del abanico", 20, "Delta, capa superior (FAKE)", 1.25),
    ("REF", "Refugio en la base de Hawksbill Gap", "refugio", 77.40875, 18.45710, -2540, 5.5, 218, 2,
     "Refugio ante tormenta de polvo", 10, "Base del escarpe del delta (FAKE)", 1.05),
    ("COM", "Repetidora, llanura norte", "comms", 77.42576, 18.45932, -2548, 3.9, 216, 1,
     "Revisión de antena", 10, "Llanura norte (FAKE)", 1.05),
]

# Fotos reales de Perseverance Raw Images (NASA/JPL-Caltech), elegidas a mano.
_RAW = "https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/"
FOTOS = {
    "HAB": (13, "NAVCAM_LEFT", "00013/ids/edr/browse/ncam/NLF_0013_0668101832_912ECM_N0030028NCAM00104_01_295J01_1200.jpg"),
    "ROV": (135, "NAVCAM_LEFT", "00135/ids/edr/browse/ncam/NLF_0135_0678933829_682ECM_N0051388NCAM03135_01_195J02_1200.jpg"),
    "E1": (565, "NAVCAM_LEFT", "00565/ids/edr/browse/ncam/NLF_0565_0717111091_992ECM_N0290000NCAM02565_01_195J01_1200.jpg"),
    "M1": (248, "NAVCAM_LEFT", "00248/ids/edr/browse/ncam/NLF_0248_0688961170_442ECM_N0080000NCAM02248_01_195J01_1200.jpg"),
    "M2": (693, "NAVCAM_LEFT", "00693/ids/edr/browse/ncam/NLF_0693_0728474333_901ECM_N0321394NCAM12693_04_195J01_1200.jpg"),
    "E2": (709, "NAVCAM_LEFT", "00709/ids/edr/browse/ncam/NLF_0709_0729893167_568ECM_N0332864NCAM12709_01_195J01_1200.jpg"),
    "REF": (437, "NAVCAM_LEFT", "00437/ids/edr/browse/ncam/NLF_0437_0705727428_789ECM_N0243900NCAM12436_01_195J01_1200.jpg"),
    "COM": (405, "NAVCAM_LEFT", "00405/ids/edr/browse/ncam/NLF_0405_0702884916_409ECM_N0201422NCAM12404_04_195J01_1200.jpg"),
}

# ---------------------------------------------------------------- zonas de alerta
# Rectángulos (lon_min, lat_min, lon_max, lat_max). Se evalúan en este orden:
# la primera que contiene el punto gana (Z2 es una franja encima de las demás).
ZONAS = [
    ("Z2", "Campo de dunas", (77.4220, 18.4410, 77.4340, 18.4530), 0.05, 5),
    ("Z1", "Delta", (77.3850, 18.4250, 77.4140, 18.4750), 0.25, 30),
    ("Z3", "Séítah", (77.4140, 18.4250, 77.4650, 18.4370), 0.15, 10),
    ("Z4", "Llanura norte", (77.4140, 18.4370, 77.4650, 18.4750), 0.08, 5),
]
# zona -> (blindaje, sombra_pct)
PROPS_ZONA = {z[0]: (z[3], z[4]) for z in ZONAS}


def zona_de(lon: float, lat: float) -> str:
    for zid, _, (x0, y0, x1, y1), *_ in ZONAS:
        if x0 <= lon <= x1 and y0 <= lat <= y1:
            return zid
    return "Z4"


def poligono(zid: str) -> list[list[float]]:
    x0, y0, x1, y1 = next(z[2] for z in ZONAS if z[0] == zid)
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


# ---------------------------------------------------------------- geometría
def metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distancia local equirectangular sobre la esfera de Marte."""
    lat_m = math.radians((a[1] + b[1]) / 2)
    dx = math.radians(b[0] - a[0]) * math.cos(lat_m) * R_MARTE
    dy = math.radians(b[1] - a[1]) * R_MARTE
    return math.hypot(dx, dy)


def semilla(a: str, b: str) -> float:
    """Pseudoaleatorio determinista en [0, 1) para el par no dirigido."""
    clave = "-".join(sorted([a, b]))
    h = 0
    for ch in clave:
        h = (h * 131 + ord(ch)) % 1_000_003
    return (h % 1000) / 1000


def polilinea(a, b, amplitud: float, n: int = 7) -> list[list[float]]:
    """Polilínea de a a b con una curva suave perpendicular (grados)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    largo = math.hypot(dx, dy) or 1
    px, py = -dy / largo, dx / largo
    pts = []
    for i in range(n):
        t = i / (n - 1)
        off = amplitud * math.sin(math.pi * t)
        pts.append([round(a[0] + dx * t + px * off, 6), round(a[1] + dy * t + py * off, 6)])
    return pts


def muestrear(geom: list[list[float]], por_tramo: int = 6) -> list[tuple[float, float]]:
    pts = []
    for p, q in zip(geom, geom[1:]):
        for k in range(por_tramo):
            t = k / por_tramo
            pts.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    pts.append(tuple(geom[-1]))
    return pts


def tobler_kmh(tan_theta: float) -> float:
    return 6 * math.exp(-3.5 * abs(tan_theta + 0.05)) * FACTOR_TRAJE


# ---------------------------------------------------------------- construcción
def construir() -> dict:
    nodos = {n[0]: n for n in NODOS}
    com_pts = [(n[3], n[4]) for n in NODOS if n[2] in ("habitat", "comms")]

    nodes_json = []
    for (nid, nombre, tipo, lon, lat, elev, pend, themis, valor, tarea, perm, unidad, _) in NODOS:
        nodes_json.append({
            "id": nid, "nombre": nombre, "tipo": tipo,
            "lon": lon, "lat": lat,
            "valor_cientifico": valor, "tarea": tarea, "permanencia_min": perm,
            "unidad_geologica": unidad,
            "zona": zona_de(lon, lat),
            "capas": {"elev_m": elev, "pendiente_deg": pend, "themis_noche": themis},
            "fotos": [{"url": _RAW + FOTOS[nid][2], "camara": FOTOS[nid][1], "sol": FOTOS[nid][0],
                       "credito": "NASA/JPL-Caltech"}],
        })

    edges = []
    for a, b in itertools.combinations(nodos, 2):
        na, nb = nodos[a], nodos[b]
        s = semilla(a, b)
        # pendiente máxima del camino directo: la peor de las dos estaciones + ruido del terreno
        pend_directa = round(max(na[6], nb[6]) + 2.5 * s, 1)
        for limite in LIMITES:
            exceso = pend_directa - limite
            if exceso > DESVIO_MAX_DEG:
                continue  # no hay camino bajo este límite
            if exceso > 0:
                pend = round(limite - 0.5 - s, 1)                 # desvío: más largo, más suave
                amplitud = 0.0012 + 0.0008 * exceso
            else:
                pend = pend_directa
                amplitud = 0.0004 * (s - 0.5)
            geom = polilinea((na[3], na[4]), (nb[3], nb[4]), amplitud)
            pts = muestrear(geom)
            dist = sum(metros(p, q) for p, q in zip(pts, pts[1:])) * TORTUOSIDAD
            zonas = sorted({zona_de(*p) for p in pts})
            blindaje = sum(PROPS_ZONA[zona_de(*p)][0] for p in pts) / len(pts)
            sombra = sum(PROPS_ZONA[zona_de(*p)][1] for p in pts) / len(pts)
            cobertura = 100 * sum(
                1 for p in pts if min(metros(p, c) for c in com_pts) <= 1500) / len(pts)
            f_terreno = (na[12] + nb[12]) / 2
            for o, d, g in ((na, nb, geom), (nb, na, list(reversed(geom)))):
                tan_theta = (d[5] - o[5]) / dist             # pendiente media con signo
                tiempo = dist / 1000 / tobler_kmh(tan_theta) * 60 * f_terreno
                edges.append({
                    "origen": o[0], "destino": d[0], "limite_deg": limite,
                    "distancia_m": round(dist),
                    "tiempo_min": round(tiempo, 1),
                    "energia_rel": round(tiempo * (1 + K_ENERGIA * pend), 1),
                    "pendiente_max_deg": pend,
                    "dosis_rel": round(tiempo * (1 - blindaje), 1),
                    "cobertura_com_pct": round(cobertura),
                    "sombra_pct": round(sombra),
                    "zonas": zonas,
                    "geometria": g,
                })

    return {
        "meta": {
            "area": "jezero_aoi_fake",
            "crs": "MTM 77.5E",
            "modelo_costo": "fake-v1",
            "fake": True,
            "generado": date.today().isoformat(),
            "limites_pendiente_deg": LIMITES,
            "nota": "Datos inventados con la forma del contrato. Reemplazar por graph.json de data/.",
        },
        "zonas": [{"id": z[0], "nombre": z[1], "poligono": poligono(z[0])} for z in ZONAS],
        "nodes": nodes_json,
        "edges": edges,
    }


# ---------------------------------------------------------------- referencia de fuerza bruta
def version_para(pendiente_max: float) -> int:
    """La versión precalculada más grande que no supera lo pedido (mínimo 15)."""
    validas = [l for l in LIMITES if l <= pendiente_max]
    return max(validas) if validas else LIMITES[0]


def aristas_filtradas(grafo, pendiente_max, zonas_cerradas=()):
    v = version_para(pendiente_max)
    return {
        (e["origen"], e["destino"]): e for e in grafo["edges"]
        if e["limite_deg"] == v and e["pendiente_max_deg"] <= pendiente_max
        and not set(e["zonas"]) & set(zonas_cerradas)
    }


def caminos_minimos(ids, aristas):
    """Floyd-Warshall por tiempo; devuelve (dist, siguiente) para reconstruir el camino."""
    INF = float("inf")
    dist = {(i, j): (0 if i == j else INF) for i in ids for j in ids}
    sig = {}
    for (o, d), e in aristas.items():
        dist[o, d] = e["tiempo_min"]
        sig[o, d] = d
    for k in ids:
        for i in ids:
            for j in ids:
                if dist[i, k] + dist[k, j] < dist[i, j]:
                    dist[i, j] = dist[i, k] + dist[k, j]
                    sig[i, j] = sig[i, k]
    return dist, sig


def expandir(i, j, sig):
    camino = [i]
    while camino[-1] != j:
        camino.append(sig[camino[-1], j])
    return camino


def mision(grafo, estaciones, tiempo_max_min, pendiente_max, zonas_cerradas=(), origen="HAB"):
    """Referencia: fuerza bruta sobre el subconjunto más valioso que entra en tiempo."""
    nodos = {n["id"]: n for n in grafo["nodes"]}
    aristas = aristas_filtradas(grafo, pendiente_max, zonas_cerradas)
    ids = list(nodos)
    dist, sig = caminos_minimos(ids, aristas)
    INF = float("inf")

    omitidas, candidatas = [], []
    for s in estaciones:
        if dist[origen, s] == INF or dist[s, origen] == INF:
            # ¿por qué no se llega? pendiente o alerta
            sin_alerta = aristas_filtradas(grafo, pendiente_max)
            d2, _ = caminos_minimos(ids, sin_alerta)
            if zonas_cerradas and d2[origen, s] < INF:
                omitidas.append({"id": s, "motivo": "alerta",
                                 "detalle": {"zonas": list(zonas_cerradas)}})
            else:
                pend_min = min(e["pendiente_max_deg"] for e in grafo["edges"]
                               if e["destino"] == s and e["limite_deg"] == LIMITES[-1])
                omitidas.append({"id": s, "motivo": "pendiente",
                                 "detalle": {"pendiente_max_deg": pend_min,
                                             "limite": pendiente_max}})
        else:
            candidatas.append(s)

    def costo(orden):
        t = sum(dist[a, b] for a, b in zip((origen, *orden), (*orden, origen)))
        return t + sum(nodos[s]["permanencia_min"] for s in orden)

    mejor = None  # (valor, -tiempo, orden)
    for r in range(len(candidatas), 0, -1):
        for sub in itertools.combinations(candidatas, r):
            for orden in itertools.permutations(sub):
                t = costo(orden)
                if t <= tiempo_max_min:
                    clave = (sum(nodos[s]["valor_cientifico"] for s in sub), -t, orden)
                    if mejor is None or clave[:2] > mejor[:2]:
                        mejor = clave
    if mejor is None:
        return {"factible": False, "ruta": [], "tramos": [],
                "omitidas": omitidas + [{"id": s, "motivo": "tiempo", "detalle": {"tiempo_max_min": tiempo_max_min}} for s in candidatas],
                "totales": {"distancia_m": 0, "tiempo_min": 0, "dosis_rel": 0, "margen_min": tiempo_max_min}}

    orden = mejor[2]
    for s in candidatas:
        if s not in orden:
            omitidas.append({"id": s, "motivo": "tiempo",
                             "detalle": {"tiempo_max_min": tiempo_max_min}})
    ruta = [origen]
    for a, b in zip((origen, *orden), (*orden, origen)):
        ruta += expandir(a, b, sig)[1:]
    tramos = []
    for a, b in zip(ruta, ruta[1:]):
        e = aristas[a, b]
        tramos.append({k: e[k] for k in ("origen", "destino", "distancia_m", "tiempo_min",
                                         "pendiente_max_deg", "cobertura_com_pct",
                                         "dosis_rel", "zonas", "geometria")})
    t_total = round(costo(orden), 1)
    return {
        "factible": True,
        "ruta": ruta,
        "tramos": tramos,
        "omitidas": omitidas,
        "totales": {
            "distancia_m": sum(t["distancia_m"] for t in tramos),
            "tiempo_min": t_total,
            "dosis_rel": round(sum(t["dosis_rel"] for t in tramos), 1),
            "margen_min": round(tiempo_max_min - t_total, 1),
        },
    }


def escribir(ruta: Path, obj) -> None:
    ruta.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    grafo = construir()
    escribir(SALIDA_GRAFO, grafo)
    SALIDA_EJEMPLOS.mkdir(exist_ok=True)

    nodos = grafo["nodes"]
    escribir(SALIDA_EJEMPLOS / "get_estaciones.response.json", [
        {k: n[k] for k in ("id", "nombre", "tipo", "valor_cientifico", "lon", "lat")} for n in nodos])
    escribir(SALIDA_EJEMPLOS / "get_estacion_E1.response.json", next(n for n in nodos if n["id"] == "E1"))

    ruta_req = {"origen": "HAB", "destino": "E1", "pendiente_max": 15}
    r = mision(grafo, ["E1"], 10_000, 15)
    tramos_ida = [t for t in r["tramos"]][: r["ruta"].index("E1")]
    escribir(SALIDA_EJEMPLOS / "post_ruta.request.json", ruta_req)
    escribir(SALIDA_EJEMPLOS / "post_ruta.response.json", {
        "factible": True, "ruta": r["ruta"][: r["ruta"].index("E1") + 1], "tramos": tramos_ida,
        "omitidas": [], "totales": {
            "distancia_m": sum(t["distancia_m"] for t in tramos_ida),
            "tiempo_min": round(sum(t["tiempo_min"] for t in tramos_ida), 1),
            "dosis_rel": round(sum(t["dosis_rel"] for t in tramos_ida), 1),
            "margen_min": None}})

    casos = {
        "demo1_mision_15deg": {"estaciones": ["E1", "M1", "M2", "E2"], "tiempo_max_min": 240,
                               "pendiente_max": 15, "modo": "orientacion"},
        "demo2_mision_20deg": {"estaciones": ["E1", "M1", "M2", "E2"], "tiempo_max_min": 240,
                               "pendiente_max": 20, "modo": "orientacion"},
    }
    resultados = {}
    for nombre, req in casos.items():
        res = mision(grafo, req["estaciones"], req["tiempo_max_min"], req["pendiente_max"])
        resultados[nombre] = res
        escribir(SALIDA_EJEMPLOS / f"post_mision.{nombre}.request.json", req)
        escribir(SALIDA_EJEMPLOS / f"post_mision.{nombre}.response.json", res)

    # alerta de polvo sobre la misión 1
    req1 = casos["demo1_mision_15deg"]
    base = resultados["demo1_mision_15deg"]
    alerta = mision(grafo, req1["estaciones"], req1["tiempo_max_min"], req1["pendiente_max"],
                    zonas_cerradas=("Z2",))
    afectadas = sorted({f'{t["origen"]}->{t["destino"]}' for t in base["tramos"] if "Z2" in t["zonas"]})
    escribir(SALIDA_EJEMPLOS / "post_alerta.request.json", {"zona": "Z2", "tipo": "polvo"})
    escribir(SALIDA_EJEMPLOS / "post_alerta.response.json", {**alerta, "aristas_afectadas": afectadas})

    # resumen en consola para chequear que la demo tiene sentido
    print(f"graph_fake.json: {len(nodos)} nodos, {len(grafo['edges'])} aristas "
          f"({', '.join(f'{l}°: {sum(e['limite_deg'] == l for e in grafo['edges'])}' for l in LIMITES)})")
    for nombre, res in [*resultados.items(), ("alerta_Z2", alerta)]:
        print(f"{nombre:22s} ruta={'-'.join(res['ruta'])}  t={res['totales']['tiempo_min']} min  "
              f"margen={res['totales']['margen_min']}  omitidas={[(o['id'], o['motivo']) for o in res['omitidas']]}")
    print("aristas afectadas por Z2:", afectadas)


if __name__ == "__main__":
    main()
