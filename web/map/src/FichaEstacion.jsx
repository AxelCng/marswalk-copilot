import { useState } from 'react';
import { PROCEDENCIA, dominio } from './estaciones.js';
import SIM from '@shared/sim3464/estaciones_capas.json';

const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(5)}°${v >= 0 ? pos : neg}`;

/** Etiqueta de procedencia (los tres tipos de estaciones_fuentes.md). */
function Tag({ tipo }) {
  const t = { NASA: ['nasa', 'Dato NASA'], VERIFICADO: ['verificado', 'Verificado'], SUPUESTO: ['supuesto', 'Supuesto'], FAKE: ['fake', 'Grafo falso'] }[tipo];
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
        <span className="chip" title="Valor científico 0–10 (supuesto con fundamento)">Valor {nodo.valor_cientifico}</span>
      </div>
      <h3>{nodo.id} · {nodo.nombre}</h3>
      <p>{nodo.tarea} · {nodo.permanencia_min} min</p>

      {foto?.url && fotoMal !== foto.url && (
        <figure className="ficha-foto">
          <img src={foto.url} alt={`Navcam de Perseverance en ${nodo.id}, sol ${foto.sol}`} loading="lazy" onError={() => setFotoMal(foto.url)} />
          <figcaption>{foto.camara} · sol {foto.sol} · {foto.credito}</figcaption>
        </figure>
      )}

      {sim && (
        <dl>
          {sim.unidad && (
            <>
              <dt className="label-caps">Unidad</dt>
              <dd><b className="simbolo">{sim.unidad.unit_symbol}</b> {sim.unidad.unit_name}</dd>
            </>
          )}
          <dt className="label-caps">Elevación</dt><dd>{fmt(sim.dtm_elev_m, 1)} m</dd>
          <dt className="label-caps">Pendiente</dt><dd>{fmt(sim.dtm_pendiente_deg, 1)}°</dd>
        </dl>
      )}

      <details className="ficha-fuentes">
        <summary className="label-caps">Fuentes</summary>
        {p && (
          <>
            <div className="ficha-sub"><span className="label-caps">Waypoint de Perseverance</span><Tag tipo="NASA" /></div>
            <dl>
              <dt className="label-caps">Sol</dt><dd>{p.waypoint_sol}</dd>
              <dt className="label-caps">Posición</dt><dd>{coord(nodo.lat, 'N', 'S')} {coord(nodo.lon, 'E', 'W')}</dd>
              <dt className="label-caps">Elev. rover</dt><dd>{fmt(p.elev_m)} m</dd>
              <dt className="label-caps">Inclin. rover</dt><dd>{fmt(p.inclinacion_rover_max_deg, 1)}°</dd>
            </dl>
            <div className="ficha-sub"><span className="label-caps">Verificación</span><Tag tipo={p.verificacion.estado} /></div>
            <p className="ficha-texto">{p.verificacion.texto}</p>
            {p.rol_supuesto && <p className="ficha-texto">Rol de {nodo.tipo}: misión tripulada ficticia <Tag tipo="SUPUESTO" /></p>}
            {p.fuente && <a className="ficha-fuente" href={p.fuente} target="_blank" rel="noreferrer">{dominio(p.fuente)} ↗</a>}
          </>
        )}
        {sim && (
          <>
            <div className="ficha-sub"><span className="label-caps">Terreno · USGS SIM 3464</span></div>
            <dl>
              <dt className="label-caps">DTM</dt><dd>CTX 20 m (elevación y pendiente)</dd>
              <dt className="label-caps">HRSC</dt><dd>{fmt(sim.hrsc_elev_m)} m (75 m)</dd>
              <dt className="label-caps">THEMIS</dt><dd>día {fmt(sim.themis_dia_dn)} · noche {fmt(sim.themis_noche_dn)} DN</dd>
              {sim.unidad?.age_prefix && (<><dt className="label-caps">Edad</dt><dd>{sim.unidad.age_prefix}</dd></>)}
            </dl>
            <a className="ficha-fuente" href={SIM.meta.url} target="_blank" rel="noreferrer">{SIM.meta.authors?.replace(';', ' y')} ({SIM.meta.pub_year}) ↗</a>
          </>
        )}
        {grafoFake && <p className="ficha-texto"><Tag tipo="FAKE" /> Las rutas todavía usan el grafo falso.</p>}
      </details>

      {onVolver && <button className="ancho" onClick={onVolver}>Volver al objetivo</button>}
    </section>
  );
}
