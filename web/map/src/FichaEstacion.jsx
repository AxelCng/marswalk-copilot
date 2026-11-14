import { useState } from 'react';
import { PROCEDENCIA, dominio } from './estaciones.js';
import SIM from '@shared/sim3464/estaciones_capas.json';

const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d }));
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(5)}°${v >= 0 ? pos : neg}`;

/** Etiqueta de procedencia (los tres tipos de estaciones_fuentes.md). */
function Tag({ tipo }) {
  const t = { NASA: ['nasa', 'NASA data'], VERIFICADO: ['verificado', 'Verified'], SUPUESTO: ['supuesto', 'Assumption'], FAKE: ['fake', 'Test graph'] }[tipo];
  return t ? <span className={`tag tag-${t[0]}`}>{t[1]}</span> : null;
}

/**
 * Ficha de estación: a la vista solo lo que sirve para la caminata (foto, tarea, terreno);
 * la procedencia de cada dato queda en "Fuentes", plegada.
 */
export default function FichaEstacion({ nodo, titulo, colorFranja, grafoFake, onVolver }) {
  const p = PROCEDENCIA[nodo.id];
  const sim = SIM.estaciones[nodo.id];
  const foto = nodo.fotos?.[0]?.url ? nodo.fotos[0] : p?.foto;
  const [fotoMal, setFotoMal] = useState(null);

  return (
    <section className="bloque ficha" style={{ '--franja': colorFranja }}>
      <div className="fila-titulo">
        <h2 className="label-caps">{titulo}</h2>
        <span className="chip" title="Science value 0–10 (reasoned assumption)">Value {nodo.valor_cientifico}</span>
      </div>
      <h3>{nodo.id} · {nodo.nombre}</h3>
      <p>{nodo.tarea} · {nodo.permanencia_min} min</p>

      {foto?.url && fotoMal !== foto.url && (
        <figure className="ficha-foto">
          <img src={foto.url} alt={`Perseverance Navcam at ${nodo.id}, sol ${foto.sol}`} loading="lazy" onError={() => setFotoMal(foto.url)} />
          <figcaption>{foto.camara} · sol {foto.sol} · {foto.credito}</figcaption>
        </figure>
      )}

      {sim && (
        <dl>
          {sim.unidad && (
            <>
              <dt className="label-caps">Unit</dt>
              <dd><b className="simbolo">{sim.unidad.unit_symbol}</b> {sim.unidad.unit_name}</dd>
            </>
          )}
          <dt className="label-caps">Elevation</dt><dd>{fmt(sim.dtm_elev_m, 1)} m</dd>
          <dt className="label-caps">Slope</dt><dd>{fmt(sim.dtm_pendiente_deg, 1)}°</dd>
        </dl>
      )}

      <details className="ficha-fuentes">
        <summary className="label-caps">Sources</summary>
        {p && (
          <>
            <div className="ficha-sub"><span className="label-caps">Perseverance waypoint</span><Tag tipo="NASA" /></div>
            <dl>
              <dt className="label-caps">Sol</dt><dd>{p.waypoint_sol}</dd>
              <dt className="label-caps">Position</dt><dd>{coord(nodo.lat, 'N', 'S')} {coord(nodo.lon, 'E', 'W')}</dd>
              <dt className="label-caps">Rover elev.</dt><dd>{fmt(p.elev_m)} m</dd>
              <dt className="label-caps">Rover tilt</dt><dd>{fmt(p.inclinacion_rover_max_deg, 1)}°</dd>
            </dl>
            <div className="ficha-sub"><span className="label-caps">Verification</span><Tag tipo={p.verificacion.estado} /></div>
            <p className="ficha-texto">{p.verificacion.texto}</p>
            {p.rol_supuesto && <p className="ficha-texto">{nodo.tipo} role: fictional crewed mission <Tag tipo="SUPUESTO" /></p>}
            {p.fuente && <a className="ficha-fuente" href={p.fuente} target="_blank" rel="noreferrer">{dominio(p.fuente)} ↗</a>}
          </>
        )}
        {sim && (
          <>
            <div className="ficha-sub"><span className="label-caps">Terrain · USGS SIM 3464</span></div>
            <dl>
              <dt className="label-caps">DTM</dt><dd>CTX 20 m (elevation and slope)</dd>
              <dt className="label-caps">HRSC</dt><dd>{fmt(sim.hrsc_elev_m)} m (75 m)</dd>
              <dt className="label-caps">THEMIS</dt><dd>day {fmt(sim.themis_dia_dn)} · night {fmt(sim.themis_noche_dn)} DN</dd>
              {sim.unidad?.age_prefix && (<><dt className="label-caps">Age</dt><dd>{String(sim.unidad.age_prefix).replace(/Noachiano/g, 'Noachian').replace(/Hesperiano/g, 'Hesperian')}</dd></>)}
            </dl>
            <a className="ficha-fuente" href={SIM.meta.url} target="_blank" rel="noreferrer">{SIM.meta.authors?.replace(';', ' y')} ({SIM.meta.pub_year}) ↗</a>
          </>
        )}
        {grafoFake && <p className="ficha-texto"><Tag tipo="FAKE" /> Routes still use the test graph.</p>}
      </details>

      {onVolver && <button className="ancho" onClick={onVolver}>Back to the target</button>}
    </section>
  );
}
