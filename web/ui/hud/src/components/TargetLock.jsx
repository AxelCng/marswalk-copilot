import React from 'react';
import { min } from '../fmt.js';
import { cardinal } from '../geo.js';

/** Retícula de objetivo fijado sobre la próxima estación, desplazada según hacia dónde mira el visor. */
export default function TargetLock({ tramo, nodo, rumbo, dx, ancho, onCentrar }) {
  const lim = ancho / 2 - 56;
  const fuera = Math.abs(dx) > lim;
  const x = Math.max(-lim, Math.min(lim, dx));
  const derecha = x > ancho / 2 - 300; // la ficha va a la izquierda si no entra
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
          {dx < 0 ? '◀ ' : ''}Centrar {tramo.destino}{dx > 0 ? ' ▶' : ''}
        </button>
      ) : (
        <div className={`lock-ficha${derecha ? ' izq' : ''}`}>
          <span className="label-caps lock-estado">Objetivo fijado</span>
          <b className="lock-nombre">
            {tramo.destino} · {nodo?.nombre ?? '—'}
          </b>
          <dl>
            <div>
              <dt>Dist</dt>
              <dd>{tramo.distancia_m} m</dd>
            </div>
            <div>
              <dt>Pend</dt>
              <dd>{tramo.pendiente_max_deg}°</dd>
            </div>
            <div>
              <dt>Marcha</dt>
              <dd>{min(tramo.tiempo_min)}</dd>
            </div>
            <div>
              <dt>Rumbo</dt>
              <dd>
                {String(Math.round(rumbo)).padStart(3, '0')}° {cardinal(rumbo)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
