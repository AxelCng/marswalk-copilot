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
          {alerta.tipo === 'polvo' ? 'Dust' : 'Comms'} alert · {alerta.zona}
          {zona?.nombre ? ` ${zona.nombre}` : ''}
        </b>
      </div>
      {afectadas.length > 0 && (
        <p>
          Route recalculated. Legs avoided: <span className="mono">{afectadas.join(', ').replaceAll('->', '→')}</span>
        </p>
      )}
      <p className="mono">
        New total {min(mision.totales.tiempo_min)} · margin {min(mision.totales.margen_min)}
      </p>
    </section>
  );
}
