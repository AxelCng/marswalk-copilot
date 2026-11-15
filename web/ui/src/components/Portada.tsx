/**
 * Portada de la consola: relieve real del delta de Jezero con el área de la misión marcada en su lugar.
 *
 * La imagen sale de web/scripts/fondo_portada.py (sombreado del DTM CTX 20 m del USGS, teñido).
 * El rectángulo se ubica con meta.aoi de GET /grafo (lon/lat reales del recorte del grafo), así que
 * si data/ cambia el área, el marco se mueve solo.
 */
import React from 'react';
import limites from '../../public/fondo/jezero-delta.json';
import type { Grafo } from '../types/mission';

interface Aoi { lon_min: number; lon_max: number; lat_min: number; lat_max: number; area_km2?: number }

// Área del graph.json real (data/out/), por si /grafo todavía no respondió
const AOI_POR_DEFECTO: Aoi = { lon_min: 77.39224, lon_max: 77.46122, lat_min: 18.42267, lat_max: 18.47027, area_km2: 10.942 };

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

interface Props {
  grafo: Grafo | null;
  estaciones: number;
}

export const Portada: React.FC<Props> = ({ grafo, estaciones }) => {
  const aoi = (grafo?.meta?.aoi as Aoi | undefined) ?? AOI_POR_DEFECTO;
  const ancho = limites.lon_max - limites.lon_min;
  const alto = limites.lat_max - limites.lat_min;
  const marco = {
    left: pct((aoi.lon_min - limites.lon_min) / ancho),
    top: pct((limites.lat_max - aoi.lat_max) / alto),
    width: pct((aoi.lon_max - aoi.lon_min) / ancho),
    height: pct((aoi.lat_max - aoi.lat_min) / alto),
  };
  const centroLat = (aoi.lat_min + aoi.lat_max) / 2;
  const centroLon = (aoi.lon_min + aoi.lon_max) / 2;
  const tramos = grafo?.edges?.length;

  return (
    <section className="portada" aria-labelledby="portada-titulo">
      {/* Relieve con el área de la misión, en coordenadas de la propia imagen */}
      <figure className="portada-relieve m-0" aria-hidden>
        <img src="/fondo/jezero-delta.jpg" alt="" className="portada-img" />
        <div className="portada-aoi" style={marco}>
          <svg className="portada-aoi-trazo" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="0" y="0" width="100" height="100" pathLength={100} />
          </svg>
          <span className="portada-aoi-rotulo">
            Mission area
            {aoi.area_km2 != null && <span className="dato-num"> {aoi.area_km2.toFixed(1)} km²</span>}
          </span>
        </div>
      </figure>

      <div className="portada-contenido">
        <h2 id="portada-titulo" className="m-0 font-display text-[30px] sm:text-[40px] leading-[1.08] font-semibold text-ink">
          Plan a walk across<br />Jezero Crater
        </h2>
        <p className="m-0 mt-3 max-w-[46ch] text-[15px] sm:text-base leading-relaxed text-ink-dim">
          Every route is computed from NASA and USGS terrain data along Perseverance&apos;s path.
          The copilot explains the result; it never makes up the numbers.
        </p>

        <dl className="portada-datos">
          <div>
            <dt>Where</dt>
            <dd className="dato-num">{centroLat.toFixed(2)}° N, {centroLon.toFixed(2)}° E</dd>
          </div>
          <div>
            <dt>Route network</dt>
            <dd className="dato-num">{estaciones} stations{tramos ? `, ${tramos} legs` : ''}</dd>
          </div>
          <div>
            <dt>Terrain</dt>
            <dd>CTX elevation model, 20 m</dd>
          </div>
          <div>
            <dt>Walking model</dt>
            <dd>Tobler&apos;s hiking function, suit-adjusted</dd>
          </div>
        </dl>
      </div>

      <p className="portada-credito m-0">
        Shaded relief of the Jezero delta from the USGS CTX 20 m elevation model.
        <span className="portada-credito-marco"> The box marks the planning area.</span>
      </p>
    </section>
  );
};
