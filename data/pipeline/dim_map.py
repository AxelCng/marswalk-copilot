"""Paso 00b: ``dim_map`` desde los metadatos oficiales del SIM 3464.

La capa ``MapBoundary`` de la geodatabase tiene las columnas LON_MIN/LON_MAX/
LAT_MIN/LAT_MAX, pero están vacías. Los valores reales están en el XML FGDC que
acompaña al mapa, y el CRS/datum salen del ``.prj`` incluido.
"""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET

from . import crs, rutas


def _texto(raiz: ET.Element, ruta: str) -> str | None:
    nodo = raiz.find(ruta)
    if nodo is None or nodo.text is None:
        return None
    return nodo.text.strip()


def _numeros(raiz: ET.Element, ruta: str) -> list[float]:
    return [float(nodo.text.strip()) for nodo in raiz.findall(ruta)
            if nodo.text and nodo.text.strip()]


def leer_metadata() -> dict:
    raiz = ET.parse(rutas.METADATA_XML).getroot()

    autores = [nodo.text.strip() for nodo in raiz.findall(".//idinfo/citation/citeinfo/origin")
               if nodo.text and nodo.text.strip()]
    publicacion = raiz.find(".//idinfo/citation/citeinfo/pubdate")
    anio = int(publicacion.text.strip()) if publicacion is not None and publicacion.text else None

    escala_txt = _texto(raiz, ".//idinfo/descript/purpose") or ""
    escala = 75000
    for palabra in escala_txt.replace(",", "").split():
        limpio = palabra.strip(".,:;()")
        if limpio.startswith("1:") and limpio[2:].isdigit():
            escala = int(limpio[2:])
            break

    oeste = _numeros(raiz, ".//idinfo/spdom/bounding/westbc")
    este = _numeros(raiz, ".//idinfo/spdom/bounding/eastbc")
    norte = _numeros(raiz, ".//idinfo/spdom/bounding/northbc")
    sur = _numeros(raiz, ".//idinfo/spdom/bounding/southbc")

    return {
        "map_key": 1,
        "series": f"SIM {_texto(raiz, './/idinfo/citation/citeinfo/serinfo/issue')}",
        "title": _texto(raiz, ".//idinfo/citation/citeinfo/title"),
        "authors": "; ".join(autores),
        "pub_year": anio,
        "publisher": _texto(raiz, ".//idinfo/citation/citeinfo/pubinfo/publish"),
        "doi": _texto(raiz, ".//idinfo/citation/citeinfo/onlink"),
        "map_scale": escala,
        "crs_name": crs.CRS_NAME,
        "datum": crs.DATUM,
        "lon_min": oeste[0] if oeste else None,
        "lon_max": este[0] if este else None,
        "lat_min": sur[0] if sur else None,
        "lat_max": norte[0] if norte else None,
        "fuente": "data/raw/sim3464/Metadata/SIM3464_metadata.xml",
        "nota": ("MapBoundary trae LON_MIN/LON_MAX/LAT_MIN/LAT_MAX en NULL; "
                 "esta extensión sale del XML FGDC. crs_name y datum salen del .prj."),
    }


def ejecutar() -> dict:
    rutas.asegurar_salida()
    dim = leer_metadata()
    destino = rutas.OUT / "dim_map.json"
    destino.write_text(json.dumps(dim, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"dim_map: {dim['series']} ({dim['pub_year']}) escala 1:{dim['map_scale']:,}")
    print(f"    CRS {dim['crs_name']} | datum {dim['datum']}")
    print(f"    extent lon {dim['lon_min']}..{dim['lon_max']}  "
          f"lat {dim['lat_min']}..{dim['lat_max']}")
    print(f"    -> {destino.relative_to(rutas.RAIZ)}")
    return dim
