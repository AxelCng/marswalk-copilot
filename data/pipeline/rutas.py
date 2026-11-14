"""Rutas del proyecto, calculadas desde la ubicación de este archivo."""
from __future__ import annotations

from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATA = RAIZ / "data"

RAW_SIM3464 = DATA / "raw" / "sim3464"
GDB = RAW_SIM3464 / "Geodatabase" / "Nili.gdb"
METADATA_XML = RAW_SIM3464 / "Metadata" / "SIM3464_metadata.xml"
RASTERS_IN = RAW_SIM3464 / "Rasters"
PRJ_MTM = RAW_SIM3464 / "CoordinateSystems" / "MTM_clon77_5E.prj"

OUT = DATA / "out"
OUT_RASTERS = OUT / "rasters"
OUT_GEOLOGIA = OUT / "geologia"

ESTACIONES_CSV = RAIZ / "estaciones.csv"

ACLARAR_LONLAT = "grados"

# Rasters de entrada con su papel en el modelo de costo.
# (clave, ruta relativa a RASTERS_IN, remuestreo, dtype de salida)
DTM_CTX = "USGS_CTX_Stereo_DTMs/J03_045994_1986_J03_046060_1986_20m_DTM.tif"
ORTO_CTX = "USGS_CTX_Stereo_DTMs/J03_045994_1986_XN_18N282W_6m_ORTHO.tif"
ORTO_CTX_MOSAICO = "Caltech_CTX_mosaic_feb2018/Nili_CTX_Mosaic_Beta01_Feb2018_MTM.tif"
THEMIS_DIA = "USGS_THEMIS_IR_controlled_mosaic_oct2018/nili_THEMIS_DayIR_Controlled_oct2018.tif"
THEMIS_NOCHE = "USGS_THEMIS_IR_controlled_mosaic_oct2018/nili_THEMIS_NightIR_Controlled_oct2018.tif"
HRSC_DTM = "HRSC/nili_h0988_0000_da4_clip.tif"
HRSC_SOMBRA = "HRSC/nili_h0988_0000_hillshade_clip.tif"


def asegurar_salida() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    OUT_RASTERS.mkdir(parents=True, exist_ok=True)
    OUT_GEOLOGIA.mkdir(parents=True, exist_ok=True)
