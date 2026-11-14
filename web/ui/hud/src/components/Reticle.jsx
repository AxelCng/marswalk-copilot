import React from 'react';

const PX_GRADO = 5; // separación de la escalera de pitch
const PASOS = [-20, -10, 10, 20];

/**
 * Retícula central con escalera de pitch (escala del visor, no un dato).
 * La marca "PEND" sí es dato: pendiente máxima del tramo según la API.
 */
export default function Reticle({ pendiente }) {
  const yPend = -Math.min(pendiente, 28) * PX_GRADO;
  return (
    <svg className="reticula" viewBox="-130 -160 260 320" aria-hidden="true">
      <circle r="4" className="ret-punto" />
      <circle r="34" className="ret-anillo" />
      <path d="M-70 0 H-42 M42 0 H70 M0 -42 V-58 M0 42 V58" className="ret-linea" />
      {PASOS.map((p) => {
        const y = -p * PX_GRADO;
        const w = Math.abs(p) === 10 ? 26 : 18;
        const dash = p < 0 ? '4 3' : undefined;
        return (
          <g key={p} className="ret-pitch">
            <path d={`M${-56 - w} ${y} H-56 V${y + (p > 0 ? 5 : -5)}`} strokeDasharray={dash} />
            <path d={`M${56 + w} ${y} H56 V${y + (p > 0 ? 5 : -5)}`} strokeDasharray={dash} />
            <text x={-60 - w} y={y + 3} textAnchor="end">{Math.abs(p)}</text>
            <text x={60 + w} y={y + 3}>{Math.abs(p)}</text>
          </g>
        );
      })}
      <g className="ret-pend" transform={`translate(112 ${yPend})`}>
        <path d="M0 0 L8 -5 V5 Z" />
        <text x="11" y="-2">PEND</text>
        <text x="11" y="9">{pendiente}°</text>
      </g>
    </svg>
  );
}
