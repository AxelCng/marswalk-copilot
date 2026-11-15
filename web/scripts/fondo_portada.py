"""
Genera la imagen de portada de web/ui a partir del relieve real de la DTM.

Entrada: web/map/public/capas/relieve_dtm.png (sombreado del DTM CTX 20 m del USGS, az 315°, alt 45°),
         con sus límites geográficos en web/map/public/capas/capas.json.
Salida:  web/ui/public/fondo/jezero-delta.jpg (recorte del delta, teñido en tonos de polvo marciano)
         web/ui/public/fondo/jezero-delta.json (límites lon/lat del recorte, para ubicar el área de misión)

Uso (desde la raíz del repo):  .venv\\Scripts\\python.exe web/scripts/fondo_portada.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
CAPAS = RAIZ / 'web/map/public/capas'
SALIDA = RAIZ / 'web/ui/public/fondo'

# Recorte en píxeles de relieve_dtm.png: canal de entrada, abanico del delta y fondo del cráter,
# evitando los bordes negros del mosaico.
X0, Y0, X1, Y1 = 660, 280, 1730, 900

# Rampa de color: de la sombra (casi el fondo de la consola) al polvo iluminado.
SOMBRA = np.array([12, 13, 18], dtype=float)      # ~ --hud-bg-deep
MEDIO = np.array([74, 47, 34], dtype=float)       # óxido apagado
LUZ = np.array([196, 142, 104], dtype=float)      # polvo al sol


def main() -> None:
    meta = json.loads((CAPAS / 'capas.json').read_text(encoding='utf-8'))['relieve_dtm']
    lon_min, lat_min, lon_max, lat_max = meta['limites']

    img = Image.open(CAPAS / 'relieve_dtm.png').convert('L')
    ancho, alto = img.size
    rec = np.asarray(img.crop((X0, Y0, X1, Y1)), dtype=float)

    # Estirar contraste con percentiles: el sombreado vive casi todo entre 180 y 240.
    lo, hi = np.percentile(rec, [1, 99.5])
    t = np.clip((rec - lo) / (hi - lo), 0, 1) ** 1.35

    # Rampa de dos tramos
    a = np.clip(t * 2, 0, 1)[..., None]
    b = np.clip(t * 2 - 1, 0, 1)[..., None]
    rgb = SOMBRA + (MEDIO - SOMBRA) * a + (LUZ - MEDIO) * b

    SALIDA.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb.astype(np.uint8)).save(SALIDA / 'jezero-delta.jpg', quality=84, optimize=True, progressive=True)

    # Límites geográficos del recorte (imagen en lon/lat lineal, igual que la usa el mapa)
    def lon(x): return lon_min + (lon_max - lon_min) * x / ancho
    def lat(y): return lat_max - (lat_max - lat_min) * y / alto
    limites = {'lon_min': lon(X0), 'lon_max': lon(X1), 'lat_min': lat(Y1), 'lat_max': lat(Y0),
               'fuente': meta['producto'], 'ancho_px': X1 - X0, 'alto_px': Y1 - Y0}
    (SALIDA / 'jezero-delta.json').write_text(json.dumps(limites, indent=2), encoding='utf-8')
    print('ok', limites)


if __name__ == '__main__':
    main()
