import React from 'react';
import { min } from '../fmt.js';

const MOTIVO = {
  pendiente: (d) => `slope ${d.pendiente_max_deg}° > ${d.limite}°`,
  tiempo: (d) => `does not fit in ${d.tiempo_max_min} min`,
  alerta: (d) => `cut off by alert ${(d.zonas ?? []).join(', ')}`,
  comms: (d) => `coverage ${d.cobertura_com_pct}% < ${d.umbral}%`,
  no_existe: () => 'does not exist',
};

/** Esquina superior izquierda: solo datos de misión que vienen de la API. */
export default function MissionPanel({ mision, idx, fuente }) {
  const { totales, tramos, ruta, omitidas = [] } = mision;
  const t = totales;
  return (
    <section className="mision" aria-label="Mission data">
      <header>
        <span className="label-caps">EVA Mission · Jezero</span>
        <span className={`chip ${fuente === 'api' ? 'nominal' : 'warning'}`}>
          {fuente === 'api' ? 'API' : 'Example'}
        </span>
      </header>
      <div className="mision-tramo">
        <span className="label-caps">Leg</span>
        <b>
          {idx + 1}
          <small> / {tramos.length}</small>
        </b>
      </div>
      <dl className="mision-datos">
        <div>
          <dt className="label-caps">Total time</dt>
          <dd>{min(t.tiempo_min)}</dd>
        </div>
        <div>
          <dt className="label-caps">Margin</dt>
          <dd>{min(t.margen_min)}</dd>
        </div>
        <div>
          <dt className="label-caps">Distance</dt>
          <dd>{t.distancia_m} m</dd>
        </div>
      </dl>
      <ol className="mision-ruta" aria-label="Route">
        {ruta.map((id, i) => (
          <li key={i} className={i === idx ? 'desde' : i === idx + 1 ? 'hacia' : i < idx ? 'hecho' : ''}>
            {id}
          </li>
        ))}
      </ol>
      {omitidas.length > 0 && (
        <ul className="mision-omitidas">
          {omitidas.map((o) => (
            <li key={o.id}>
              <span className="label-caps">Skipped {o.id}</span> {MOTIVO[o.motivo]?.(o.detalle) ?? o.motivo}
            </li>
          ))}
        </ul>
      )}
      {!mision.factible && <p className="chip critical">Mission not feasible</p>}
    </section>
  );
}
