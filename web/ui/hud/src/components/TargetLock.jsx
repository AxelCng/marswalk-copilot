import React from 'react';
import { min } from '../fmt.js';
import { cardinal } from '../geo.js';
import { capasEstacion, unidadesDelTramo } from '../sim.js';

/** Retícula de objetivo fijado sobre la próxima estación, desplazada según hacia dónde mira el visor. */
export default function TargetLock({ tramo, nodo, rumbo, dx, ancho, onCentrar }) {
  const lim = ancho / 2 - 56;
  const fuera = Math.abs(dx) > lim;
  const x = Math.max(-lim, Math.min(lim, dx));
  const derecha = x > ancho / 2 - 300;
  const sim = capasEstacion(tramo.destino);
  const cruza = unidadesDelTramo(tramo.geometria); // la ficha va a la izquierda si no entra
  return (
    <div className={`lock${fuera ? ' fuera' : ''}`} style={{ transform: `translateX(${x}px)` }}>
      <div className="lock-caja">
        <i className="c tl" />
        <i className="c tr" />
        <i className="c bl" />
        <i className="c br" />
        <span className="lock-id">{tramo.destino}</span>
      </div>
      {fuera ? (
        <button className="lock-centrar" onClick={onCentrar}>
          {dx < 0 ? '◀ ' : ''}Center {tramo.destino}{dx > 0 ? ' ▶' : ''}
        </button>
      ) : (
        <div className={`lock-ficha${derecha ? ' izq' : ''}`}>
          <span className="label-caps lock-estado">Target locked</span>
          <b className="lock-nombre">
            {tramo.destino} · {nodo?.nombre ?? '—'}
          </b>
          <dl>
            <div>
              <dt>Dist</dt>
              <dd>{tramo.distancia_m} m</dd>
            </div>
            <div>
              <dt>Slope</dt>
              <dd>{tramo.pendiente_max_deg}°</dd>
            </div>
            <div>
              <dt>Walk</dt>
              <dd>{min(tramo.tiempo_min)}</dd>
            </div>
            <div>
              <dt>Heading</dt>
              <dd>
                {String(Math.round(rumbo)).padStart(3, '0')}° {cardinal(rumbo)}
              </dd>
            </div>
            {sim?.dtm_elev_m != null && (
              <div>
                <dt>Elev DTM</dt>
                <dd>{sim.dtm_elev_m} m</dd>
              </div>
            )}
            {sim?.themis_noche_dn != null && (
              <div>
                <dt>THEMIS N</dt>
                <dd>{sim.themis_noche_dn} DN</dd>
              </div>
            )}
          </dl>
          {sim?.unidad && (
            <p className="lock-geo">
              <b>{sim.unidad.unit_symbol}</b> {sim.unidad.unit_name}
              {sim.unidad.age_prefix ? ` · ${String(sim.unidad.age_prefix).replace(/Noachiano/g, 'Noachian').replace(/Hesperiano/g, 'Hesperian')}` : ''}
            </p>
          )}
          {cruza.length > 1 && <p className="lock-geo sub">Crosses {cruza.join(' → ')}</p>}
          <span className="lock-fuente">Terrain: USGS SIM 3464</span>
        </div>
      )}
    </div>
  );
}
