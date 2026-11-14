import { useState } from 'react';
import { PROCEDENCIA, dominio } from './estaciones.js';
import SIM from '@shared/sim3464/estaciones_capas.json';

const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(5)}°${v >= 0 ? pos : neg}`;

const SUPERFICIE = { 'dark-colored mantling material': 'Manto de material oscuro', ridged: 'Terreno con crestas' };

/** Etiqueta de procedencia, con los mismos tres tipos que estaciones_fuentes.md. */
function Tag({ tipo }) {
  const t = { USGS: ['nasa', 'USGS SIM 3464'], NASA: ['nasa', 'Dato NASA'], VERIFICADO: ['verificado', 'Verificado'], SUPUESTO: ['supuesto', 'Supuesto'], FAKE: ['fake', 'Grafo falso'], DTM: ['nasa', 'DTM'] }[tipo];
  return t ? <span className={`tag tag-${t[0]}`}>{t[1]}</span> : null;
}

/**
 * Ficha de estación: separa lo que viene de NASA (waypoint, foto), lo verificado,
 * lo supuesto por el equipo y lo que todavía es del grafo falso.
 */
export default function FichaEstacion({ nodo, titulo, colorFranja, grafoFake, onVolver }) {
  const p = PROCEDENCIA[nodo.id];
  const foto = nodo.fotos?.[0]?.url ? nodo.fotos[0] : p?.foto;
  const [fotoMal, setFotoMal] = useState(null);
  const sim = SIM.estaciones[nodo.id];

  return (
    <section className="bloque ficha" style={{ '--franja': colorFranja }}>
      <div className="fila-titulo">
        <h2 className="label-caps">{titulo}</h2>
        <span className="chip" title="Valor científico 0–10 (supuesto con fundamento)">Valor {nodo.valor_cientifico}</span>
      </div>
      <h3>{nodo.id} · {nodo.nombre}</h3>
      <p>
        {nodo.tarea} · {nodo.permanencia_min} min <Tag tipo="SUPUESTO" />
      </p>

      {foto?.url && fotoMal !== foto.url && (
        <figure className="ficha-foto">
          <img src={foto.url} alt={`Navcam de Perseverance en ${nodo.id}, sol ${foto.sol}`} loading="lazy" onError={() => setFotoMal(foto.url)} />
          <figcaption>{foto.camara} · sol {foto.sol} · {foto.credito}</figcaption>
        </figure>
      )}

      {p ? (
        <>
          <div className="ficha-sub">
            <span className="label-caps">Waypoint de Perseverance</span>
            <Tag tipo="NASA" />
          </div>
          <dl>
            <dt className="label-caps">Sol</dt><dd>{p.waypoint_sol}</dd>
            <dt className="label-caps">Posición</dt><dd>{coord(nodo.lat, 'N', 'S')} {coord(nodo.lon, 'E', 'W')}</dd>
            <dt className="label-caps">Elevación</dt><dd>{fmt(p.elev_m)} m</dd>
            <dt className="label-caps" title="Inclinación medida por el rover donde estaba parado; no es la pendiente del tramo">Inclin. rover</dt>
            <dd>{fmt(p.inclinacion_rover_max_deg, 1)}° <span className="nota-dd">máx. medida en la estadía</span></dd>
          </dl>

          <div className="ficha-sub">
            <span className="label-caps">Verificación</span>
            <Tag tipo={p.verificacion.estado} />
          </div>
          <p className="ficha-texto">{p.verificacion.texto}</p>
          {p.rol_supuesto && (
            <p className="ficha-texto">
              El rol de {nodo.tipo} es de la misión tripulada ficticia <Tag tipo="SUPUESTO" />
            </p>
          )}
          {p.fuente && (
            <a className="ficha-fuente" href={p.fuente} target="_blank" rel="noreferrer">
              Fuente: {dominio(p.fuente)} ↗
            </a>
          )}
        </>
      ) : (
        <p className="ficha-texto">Esta estación no está en estaciones.csv: sin procedencia documentada.</p>
      )}

      {sim && (
        <>
          <div className="ficha-sub">
            <span className="label-caps">Terreno · mapa geológico</span>
            <Tag tipo="USGS" />
          </div>
          <dl>
            {sim.unidad && (
              <>
                <dt className="label-caps">Unidad</dt>
                <dd>
                  <b className="simbolo">{sim.unidad.unit_symbol}</b> {sim.unidad.unit_name}
                  {sim.unidad.age_prefix && <span className="nota-dd"> · {sim.unidad.age_prefix}</span>}
                </dd>
              </>
            )}
            {sim.rasgos_superficie?.length > 0 && (<><dt className="label-caps">Superficie</dt><dd>{sim.rasgos_superficie.map((x) => SUPERFICIE[x] ?? x).join(', ')}</dd></>)}
            <dt className="label-caps" title={SIM.meta.productos.dtm}>Elev. DTM</dt><dd>{fmt(sim.dtm_elev_m, 1)} m <span className="nota-dd">CTX 20 m</span></dd>
            <dt className="label-caps" title={SIM.meta.productos.pendiente}>Pend. DTM</dt><dd>{fmt(sim.dtm_pendiente_deg, 1)}° <span className="nota-dd">celda 20 m</span></dd>
            <dt className="label-caps" title={SIM.meta.productos.hrsc}>Elev. HRSC</dt><dd>{fmt(sim.hrsc_elev_m)} m <span className="nota-dd">75 m</span></dd>
            <dt className="label-caps" title={SIM.meta.productos.themis}>THEMIS IR</dt>
            <dd>día {fmt(sim.themis_dia_dn)} · noche {fmt(sim.themis_noche_dn)} <span className="nota-dd">DN relativo</span></dd>
          </dl>
          <a className="ficha-fuente" href={SIM.meta.url} target="_blank" rel="noreferrer">
            {SIM.meta.authors?.replace(';', ' y')} ({SIM.meta.pub_year}), USGS {SIM.meta.series} ↗
          </a>
        </>
      )}

      {grafoFake ? (
        <p className="ficha-texto"><Tag tipo="FAKE" /> El grafo de rutas todavía es el falso: sus pendientes y THEMIS no salen de estas capas.</p>
      ) : (
        <>
          <div className="ficha-sub">
            <span className="label-caps">Capas del grafo</span>
            <Tag tipo="DTM" />
          </div>
          <dl>
            <dt className="label-caps">Pendiente</dt><dd>{fmt(nodo.capas?.pendiente_deg, 1)}°</dd>
            {nodo.capas?.themis_noche != null && (<><dt className="label-caps">THEMIS noche</dt><dd>{fmt(nodo.capas.themis_noche)}</dd></>)}
          </dl>
        </>
      )}

      {onVolver && <button className="ancho" onClick={onVolver}>Volver al objetivo</button>}
    </section>
  );
}
