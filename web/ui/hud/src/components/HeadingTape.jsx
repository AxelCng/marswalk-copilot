import React from 'react';
import { cardinal, delta, norm } from '../geo.js';

const SPAN = 90; // grados visibles en la cinta
const LETRAS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };

/** Cinta de rumbo: centrada en la vista; la marca cian es el rumbo a la próxima estación. */
export default function HeadingTape({ vista, objetivo, idObjetivo }) {
  const pos = (d) => 50 + (delta(vista, d) / SPAN) * 100;
  const marcas = [];
  const desde = Math.ceil((vista - SPAN / 2) / 5) * 5;
  for (let d = desde; d <= vista + SPAN / 2; d += 5) {
    const g = norm(d);
    const mayor = g % 15 === 0;
    marcas.push(
      <div key={d} className={`tick${mayor ? ' mayor' : ''}`} style={{ left: `${pos(g)}%` }}>
        {mayor && <span className={LETRAS[g] ? 'card' : ''}>{LETRAS[g] ?? String(g).padStart(3, '0')}</span>}
      </div>,
    );
  }
  const pObj = pos(objetivo);
  const fuera = pObj < 2 || pObj > 98;
  return (
    <div className="cinta" role="img" aria-label={`Rumbo de vista ${Math.round(vista)}°, objetivo ${idObjetivo} a ${Math.round(objetivo)}°`}>
      <div className="cinta-escala">
        {marcas}
        <div
          className={`cinta-obj${fuera ? ' fuera' : ''}`}
          style={{ left: `${Math.max(2, Math.min(98, pObj))}%` }}
        >
          <span>{fuera ? (pObj < 50 ? `◀ ${idObjetivo}` : `${idObjetivo} ▶`) : idObjetivo}</span>
        </div>
      </div>
      <div className="cinta-centro">
        <b>{String(Math.round(norm(vista)) % 360).padStart(3, '0')}°</b>
        <span>{cardinal(vista)}</span>
      </div>
    </div>
  );
}
