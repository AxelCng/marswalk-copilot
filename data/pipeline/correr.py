"""Ejecuta los pasos del pipeline. Ver ``data/README.md``.

    python -m data.pipeline.correr --paso 00
    python -m data.pipeline.correr --paso todo
"""
from __future__ import annotations

import argparse
import sys

PASOS = {
    "00": [("AOI", "aoi"), ("dim_map", "dim_map")],
    "10": [("rasters", "rasters")],
    "20": [("waypoints", "waypoints")],
    "30": [("geología", "geologia")],
    "40": [("verificación", "verificar")],
}


def correr(nombres: list[tuple[str, str]]) -> None:
    import importlib
    for etiqueta, modulo in nombres:
        print(f"\n== {etiqueta} ==")
        importlib.import_module(f"data.pipeline.{modulo}").ejecutar()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paso", default="todo",
                        choices=[*PASOS, "todo"], help="paso a ejecutar")
    args = parser.parse_args()

    seleccion = []
    if args.paso == "todo":
        for grupo in PASOS.values():
            seleccion.extend(grupo)
    else:
        seleccion = PASOS[args.paso]

    try:
        correr(seleccion)
    except (OSError, ValueError, KeyError) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
