import React from 'react';
import { min } from '../fmt.js';

/** Franja de alerta (abajo a la izquierda). Rojo solo acá. */
export default function AlertStrip({ alerta, zona, mision }) {
  const afectadas = mision.aristas_afectadas ?? [];
  return (
    <section className="alerta-franja" role="alert">
      <div className="alerta-titulo">
        <span className="alerta-icono" aria-hidden="true">!</span>
        <b>
          Alerta de {alerta.tipo} · {alerta.zona}
          {zona?.nombre ? ` ${zona.nombre}` : ''}
        </b>
      </div>
      {afectadas.length > 0 && (
        <p>
          Ruta recalculada. Tramos evitados: <span className="mono">{afectadas.join(', ').replaceAll('->', '→')}</span>
        </p>
      )}
      <p className="mono">
        Nuevo total {min(mision.totales.tiempo_min)} · margen {min(mision.totales.margen_min)}
      </p>
    </section>
  );
}
