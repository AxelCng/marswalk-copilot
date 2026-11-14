import React from 'react';
import { min } from '../fmt.js';

const MOTIVO = {
  pendiente: (d) => `pendiente ${d.pendiente_max_deg}° > ${d.limite}°`,
  tiempo: (d) => `no entra en ${d.tiempo_max_min} min`,
  alerta: (d) => `aislada por alerta ${(d.zonas ?? []).join(', ')}`,
  comms: (d) => `cobertura ${d.cobertura_com_pct}% < ${d.umbral}%`,
  no_existe: () => 'no existe',
};

/** Esquina superior izquierda: solo datos de misión que vienen de la API. */
export default function MissionPanel({ mision, idx, fuente }) {
  const { totales, tramos, ruta, omitidas = [] } = mision;
  const t = totales;
  return (
    <section className="mision" aria-label="Datos de la misión">
      <header>
        <span className="label-caps">Misión EVA · Jezero</span>
        <span className={`chip ${fuente === 'api' ? 'nominal' : 'warning'}`}>
          {fuente === 'api' ? 'API' : 'Ejemplo'}
        </span>
      </header>
      <div className="mision-tramo">
        <span className="label-caps">Tramo</span>
        <b>
          {idx + 1}
          <small> / {tramos.length}</small>
        </b>
      </div>
      <dl className="mision-datos">
        <div>
          <dt className="label-caps">Tiempo total</dt>
          <dd>{min(t.tiempo_min)}</dd>
        </div>
        <div>
          <dt className="label-caps">Margen</dt>
          <dd>{min(t.margen_min)}</dd>
        </div>
        <div>
          <dt className="label-caps">Distancia</dt>
          <dd>{t.distancia_m} m</dd>
        </div>
      </dl>
      <ol className="mision-ruta" aria-label="Ruta">
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
              <span className="label-caps">Omitida {o.id}</span> {MOTIVO[o.motivo]?.(o.detalle) ?? o.motivo}
            </li>
          ))}
        </ul>
      )}
      {!mision.factible && <p className="chip critical">Misión no factible</p>}
    </section>
  );
}
