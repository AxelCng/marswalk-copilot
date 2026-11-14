import { useEffect, useState } from 'react';
import { CAPAS_INDICE } from './MarsMap.jsx';

// Panel de capas estilo herramienta GIS: interruptor plano, indicador de estado,
// fuente/resolución y opacidad por capa. Las capas ráster salen de USGS SIM 3464.
const FILAS = [
  { clave: 'base', nombre: 'Ortoimagen CTX', fuente: () => 'CTX 5 m + mosaico SIM 3464' },
  { clave: 'relieve', raster: 'relieve_dtm', nombre: 'Relieve DTM', fuente: (m) => `DTM CTX · ${m.metros_por_pixel} m/px` },
  { clave: 'pendiente', raster: 'pendiente_dtm', nombre: 'Pendiente', fuente: (m) => `DTM CTX · ${m.metros_por_pixel} m/px` },
  { clave: 'themis', raster: 'themis_noche', nombre: 'THEMIS IR noche', fuente: (m) => `${m.metros_por_pixel} m/px · DN relativo` },
  { clave: 'geologia', nombre: 'Geología', fuente: (_, ok) => (ok ? 'SIM 3464 · 1:75 000' : 'sin geologia.geojson') },
  { clave: 'aristas', nombre: 'Grafo de rutas', fuente: (_, __, fake) => (fake ? 'graph_fake.json' : 'API /grafo') },
  { clave: 'zonas', nombre: 'Zonas de alerta', fuente: () => 'Z1–Z4' },
];

export const CAPAS_INICIALES = {
  base: { on: true, op: 1 },
  relieve: { on: false, op: 0.6 },
  pendiente: { on: false, op: 0.75 },
  themis: { on: false, op: 0.7 },
  geologia: { on: true, op: 0.8 },
  aristas: { on: true, op: 1 },
  zonas: { on: true, op: 1 },
};

export default function PanelCapas({ capas, setCapas, hayGeologia, grafoFake }) {
  const [meta, setMeta] = useState({});
  const [abierto, setAbierto] = useState(() => window.innerWidth >= 1440);
  const activas = Object.values(capas).filter((c) => c.on).length;
  useEffect(() => {
    fetch(CAPAS_INDICE).then((r) => (r.ok ? r.json() : {})).then(setMeta).catch(() => setMeta({}));
  }, []);

  const cambiar = (clave, cambio) => setCapas((c) => ({ ...c, [clave]: { ...c[clave], ...cambio } }));
  const clases = meta.pendiente_dtm?.clases;

  return (
    <section className="capas" aria-label="Capas del mapa">
      <header className="capas-cab">
        <button className="capas-plegar" aria-expanded={abierto} aria-controls="capas-lista" onClick={() => setAbierto((v) => !v)}>
          <span aria-hidden="true">{abierto ? '▾' : '▸'}</span> Capas <span className="capas-n">{activas}/{FILAS.length}</span>
        </button>
        {abierto && <span className="label-caps">Opacidad</span>}
      </header>
      {abierto && (<>
      <ul className="capas-lista" id="capas-lista">
        {FILAS.map((f) => {
          const m = f.raster ? meta[f.raster] : {};
          const disponible = f.raster ? !!m : f.clave !== 'geologia' || hayGeologia;
          const c = capas[f.clave];
          const id = `capa-${f.clave}`;
          return (
            <li key={f.clave} className={disponible ? '' : 'no-disp'}>
              <label className="interruptor" htmlFor={id}>
                <input
                  id={id}
                  type="checkbox"
                  role="switch"
                  checked={disponible && c.on}
                  disabled={!disponible}
                  onChange={(e) => cambiar(f.clave, { on: e.target.checked })}
                />
                <span className="interruptor-pista" aria-hidden="true" />
              </label>
              <span className={`led ${!disponible ? 'off' : c.on ? 'on' : ''}`} aria-hidden="true" />
              <span className="capa-nombre">
                {f.nombre}
                <small>{disponible ? f.fuente(m ?? {}, hayGeologia, grafoFake) : 'no disponible'}</small>
              </span>
              <input
                className="opacidad"
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(c.op * 100)}
                disabled={!disponible || !c.on}
                aria-label={`Opacidad de ${f.nombre}`}
                onChange={(e) => cambiar(f.clave, { op: Number(e.target.value) / 100 })}
              />
              <span className="capa-pct">{Math.round(c.op * 100)}</span>
            </li>
          );
        })}
      </ul>
      {capas.pendiente.on && clases && (
        <div className="leyenda-pend" aria-label="Leyenda de pendiente">
          {clases.map((k) => (
            <span key={k.desde} title={`${k.pct} % del área con DTM`}>
              <i style={{ background: `rgba(${k.rgba[0]}, ${k.rgba[1]}, ${k.rgba[2]}, ${k.rgba[3] / 255})` }} />
              {k.hasta >= 90 ? `>${k.desde}°` : `${k.desde}–${k.hasta}°`}
            </span>
          ))}
        </div>
      )}
      {capas.themis.on && meta.themis_noche && <p className="capa-nota">{meta.themis_noche.nota}</p>}
      </>)}
    </section>
  );
}
