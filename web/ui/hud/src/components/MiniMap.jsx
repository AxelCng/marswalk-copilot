import React, { useMemo } from 'react';
import { proyeccion } from '../geo.js';
import { UNIDADES } from '../sim.js';

// Tonos tierra apagados por unidad (no son los colores oficiales del SIM 3464).
const TONO = { Njf: '#8f6a4f', NHjf1: '#b8734a', NHjf2: '#c49a5a', Nle: '#7d8a5c', Nue: '#6e6a8a', Aeb: '#9c8b6e', cr: '#a35d4e' };
const anillos = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

const SIZE = 200;
const linea = (p, geom) => geom.map((c, i) => `${i ? 'L' : 'M'}${p(c).map((v) => v.toFixed(1)).join(' ')}`).join(' ');

/** Minimapa táctico: ruta en SVG con tramos[].geometria. */
export default function MiniMap({ mision, misionPrevia, alerta, zona, idx, nodos }) {
  const afectadas = new Set(mision.aristas_afectadas ?? []);
  const tramosPrevios = (misionPrevia?.tramos ?? []).filter((t) => afectadas.has(`${t.origen}->${t.destino}`));

  const p = useMemo(() => {
    const puntos = [...mision.tramos, ...tramosPrevios].flatMap((t) => t.geometria);
    if (zona) puntos.push(...zona.poligono);
    return proyeccion(puntos, SIZE);
  }, [mision, misionPrevia, zona]);

  const ids = [...new Set(mision.ruta)];
  const actual = mision.tramos[idx];

  return (
    <figure className="minimapa" aria-label="Minimapa táctico de la ruta">
      <figcaption className="label-caps">
        Táctico <span>N ↑</span>
      </figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <g className="mm-geo">
          {UNIDADES.map((f) =>
            anillos(f.geometry).map((poly, k) => (
              <path
                key={`${f.properties.feature_key}-${k}`}
                d={poly.map((ring) => linea(p, ring) + ' Z').join(' ')}
                fill={TONO[f.properties.unit_symbol] ?? '#7a9a8a'}
              >
                <title>{f.properties.unit_symbol} · {f.properties.unit_name}</title>
              </path>
            )),
          )}
        </g>
        {zona && (
          <path className="mm-zona" d={linea(p, zona.poligono) + ' Z'}>
            <title>{zona.id} {zona.nombre}</title>
          </path>
        )}
        {zona && (
          <text className="mm-zona-id" x={p(zona.poligono[0])[0] + 3} y={p(zona.poligono[0])[1] - 3}>
            {zona.id}
          </text>
        )}
        {tramosPrevios.map((t) => (
          <path key={`prev-${t.origen}-${t.destino}`} className="mm-afectado" d={linea(p, t.geometria)} />
        ))}
        {mision.tramos.map((t, i) => (
          <path key={i} className={`mm-tramo${i < idx ? ' hecho' : ''}`} d={linea(p, t.geometria)} />
        ))}
        {actual && <path className="mm-actual" d={linea(p, actual.geometria)} />}
        {ids.map((id) => {
          const n = nodos[id];
          if (!n) return null;
          const [x, y] = p([n.lon, n.lat]);
          const esObj = actual?.destino === id;
          return (
            <g key={id} className={`mm-nodo${esObj ? ' obj' : ''}`}>
              <circle cx={x} cy={y} r={esObj ? 4 : 3} />
              <text x={x + 6} y={y + 3}>{id}</text>
            </g>
          );
        })}
        {actual && (() => {
          const [x, y] = p(actual.geometria[0]);
          return <circle className="mm-yo" cx={x} cy={y} r="5" />;
        })()}
      </svg>
    </figure>
  );
}
