import { useEffect, useMemo, useRef, useState } from 'react';
import MarsMap, { COLOR_TIPO } from './MarsMap.jsx';
import { getGrafo, ejemplos, postMision, postAlerta, postReset } from './api.js';
import { getGeologia } from './geologia.js';
import FichaEstacion from './FichaEstacion.jsx';
import PanelCapas, { CAPAS_INICIALES } from './PanelCapas.jsx';
import Visor3D from './Visor3D.jsx';
import paramsYaml from '@repo/params.yaml?raw';

// Marco del mapa (mosaico CTX del SIM 3464): el astronauta no sale de acá.
const MARCO = [76.802, 17.702, 77.798, 18.698];

// Consola "Geospatial Map" (AeroHUD Jezero): mapa a pantalla completa con
// barra superior, riel de planificación a la izquierda, tiles de telemetría
// sobre el mapa, riel de ruta a la derecha y control de capas abajo.
// Cada número sale de /mision, /alerta o del grafo: nada se inventa aquí.

const MISION_BASE = { estaciones: ['E1', 'M1', 'M2', 'E2'], tiempo_max_min: 240, modo: 'orientacion', origen: 'HAB' };
const EJEMPLO_POR_PENDIENTE = { 15: ejemplos.demo1, 20: ejemplos.demo2 };
// Versiones del grafo que precalcula el motor (params.yaml → costo.limites_pendiente_deg).
const LIMITES_PENDIENTE = (/limites_pendiente_deg:\s*\[([^\]]+)\]/.exec(paramsYaml)?.[1] ?? '15, 20, 25').split(',').map(Number);
const MARGEN_MAPA = { top: 60, right: 60, bottom: 110, left: 60 };

const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d }));


const MOTIVO = {
  pendiente: (d) => `slope ${d.pendiente_max_deg}° > ${d.limite}°`,
  tiempo: (d) => `does not fit in ${d.tiempo_max_min} min`,
  alerta: (d) => `cut off by the alert in ${(d.zonas ?? []).join(', ')}`,
  comms: (d) => `coverage ${d.cobertura_com_pct}% < ${d.umbral}%`,
  no_existe: () => 'unknown station',
};
const textoMotivo = (o) => (MOTIVO[o.motivo]?.(o.detalle ?? {}) ?? o.motivo);

export default function App() {
  const [pendiente, setPendiente] = useState(15);
  const [grafo, setGrafo] = useState(null);
  const [geologia, setGeologia] = useState(null);
  const [mision, setMision] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [estado, setEstado] = useState('No mission. Pick stations and calculate the route, or open the 3D visor to explore the terrain.');
  const [seleccion, setSeleccion] = useState(null);
  const [paso, setPaso] = useState(-1);
  const [capas, setCapas] = useState(CAPAS_INICIALES);
  const [elegidas, setElegidas] = useState(MISION_BASE.estaciones);
  const [tiempoMax, setTiempoMax] = useState(MISION_BASE.tiempo_max_min);
  const [zonaAlerta, setZonaAlerta] = useState('Z2');
  const [mapa, setMapa] = useState(null);
  const [visor, setVisor] = useState(false);
  const [astronauta, setAstronauta] = useState(null);
  const controlVisor = useRef(null);

  useEffect(() => { getGrafo(pendiente).then(setGrafo); }, [pendiente]);
  useEffect(() => { getGeologia().then(setGeologia); }, []);

  const usarApi = grafo?.fuente === 'api';
  const nodos = useMemo(() => Object.fromEntries((grafo?.nodes ?? []).map((n) => [n.id, n])), [grafo]);
  const visitables = (grafo?.nodes ?? []).filter((n) => n.tipo !== 'habitat');

  async function calcular(pend = pendiente, ests = elegidas, tmax = tiempoMax) {
    setAlerta(null);
    setPendiente(pend);
    if (usarApi) {
      try {
        setMision(await postMision({ ...MISION_BASE, estaciones: ests, tiempo_max_min: tmax, pendiente_max: pend }));
        setEstado(`Mission calculated by the API · ≤ ${pend}° · ${tmax} min`);
        return;
      } catch (e) {
        setEstado(`The API failed (${e.message}). Showing the example.`);
      }
    }
    const ej = EJEMPLO_POR_PENDIENTE[pend];
    if (ej) {
      setMision(ej);
      if (!usarApi) setEstado(`No API: example from contracts/ for ≤ ${pend}° (stations E1, M1, M2, E2 · 240 min).`);
    } else {
      setMision(null);
      setEstado(`No API and no example for ≤ ${pend}°. Start engine/ to calculate.`);
    }
  }

  async function simularPolvo() {
    if (usarApi) {
      try {
        const r = await postAlerta(zonaAlerta, 'polvo');
        setMision(r);
        setAlerta({ zona: zonaAlerta, tipo: 'polvo', aristas_afectadas: r.aristas_afectadas });
        setEstado(`Dust alert in ${zonaAlerta}: mission recalculated by the API.`);
        return;
      } catch (e) {
        setEstado(`The API failed (${e.message}). Showing the Z2 example.`);
      }
    }
    setPendiente(15);
    setMision(ejemplos.alertaZ2);
    setAlerta({ zona: 'Z2', tipo: 'polvo', aristas_afectadas: ejemplos.alertaZ2.aristas_afectadas });
    if (!usarApi) setEstado('No API: example dust alert in Z2 over the 15° mission.');
  }

  async function reset() {
    if (usarApi) await postReset().catch(() => {});
    setMision(null);
    setAlerta(null);
    setEstado('Alerts and mission cleared.');
  }

  const t = mision?.totales;
  const tramos = mision?.tramos ?? [];
  const pendMax = tramos.length ? Math.max(...tramos.map((x) => x.pendiente_max_deg ?? 0)) : null;
  const comMin = tramos.length ? Math.min(...tramos.map((x) => x.cobertura_com_pct ?? 100)) : null;
  const visitadas = [...new Set(mision?.ruta ?? [])].map((id) => nodos[id]).filter(Boolean);
  const objetivo = visitadas.filter((n) => n.tipo !== 'habitat').sort((a, b) => (b.valor_cientifico ?? 0) - (a.valor_cientifico ?? 0))[0];
  const sel = seleccion ? nodos[seleccion] : null;

  return (
    <div className={`consola${alerta ? ' en-alerta' : ''}`}>
      {/* ---------------- Barra superior ---------------- */}
      <header className="barra">
        <div className="marca">
          <span className="marca-icono" aria-hidden="true" />
          <div>
            <strong>MarsWalk</strong>
            <span className="label-caps">Copilot // EVA nav</span>
          </div>
        </div>
        <div className="barra-datos">
          <span className={`chip ${usarApi ? 'nominal' : 'warning'}`}>{usarApi ? 'API online' : 'Example data'}</span>
          {alerta && <span className="chip critical">Dust · {alerta.zona}</span>}
        </div>
      </header>

      {/* ---------------- Riel izquierdo: planificación ---------------- */}
      <aside className="riel riel-izq">
        <section className="bloque">
          <h2 className="label-caps">Plan traverse</h2>
          <fieldset className="estaciones">
            <legend className="sr">Stations to visit</legend>
            {visitables.map((n) => (
              <label key={n.id} className="estacion" htmlFor={`est-${n.id}`}>
                <input
                  id={`est-${n.id}`}
                  type="checkbox"
                  checked={elegidas.includes(n.id)}
                  onChange={(e) => setElegidas((v) => (e.target.checked ? [...v, n.id] : v.filter((x) => x !== n.id)))}
                />
                <i style={{ background: COLOR_TIPO[n.tipo] }} />
                <b>{n.id}</b>
                <span>{n.nombre}</span>
              </label>
            ))}
          </fieldset>

          <label className="campo" htmlFor="tiempo-max">
            <span className="label-caps">Maximum time</span>
            <span className="input-unidad">
              <input id="tiempo-max" type="number" min="30" step="10" value={tiempoMax} onChange={(e) => setTiempoMax(Number(e.target.value))} />
              <span>min</span>
            </span>
          </label>

          <div className="campo">
            <span className="label-caps" id="lbl-pend">Maximum slope</span>
            <div className="segmentado" role="radiogroup" aria-labelledby="lbl-pend">
              {LIMITES_PENDIENTE.map((p) => (
                <button key={p} id={`pend-${p}`} role="radio" aria-checked={pendiente === p} className={pendiente === p ? 'activo' : ''} onClick={() => setPendiente(p)}>
                  {p}°
                </button>
              ))}
            </div>
          </div>

          <button id="btn-calcular" className="primario ancho" onClick={() => calcular()} disabled={!elegidas.length}>
            Calculate optimal route
          </button>
        </section>

        <section className="bloque">
          <h2 className="label-caps">Dust alert</h2>
          <div className="alerta-herr">
            <select id="zona-alerta" aria-label="Alert zone" value={zonaAlerta} onChange={(e) => setZonaAlerta(e.target.value)}>
              {(grafo?.zonas ?? []).map((z) => <option key={z.id} value={z.id}>{z.id} · {z.nombre}</option>)}
            </select>
            <button id="btn-polvo" className="alerta" onClick={simularPolvo} disabled={!mision}>Simulate</button>
          </div>
          <button id="btn-reset" onClick={reset}>Reset</button>
        </section>

        <p className="estado">{estado}</p>
      </aside>

      {/* ---------------- Mapa ---------------- */}
      <main className={visor ? "lienzo con-visor" : "lienzo"}>
        <MarsMap
          grafo={grafo}
          mision={mision}
          alerta={alerta}
          geologia={geologia}
          capas={{ ...capas, geologia: { ...capas.geologia, on: capas.geologia.on && !!geologia } }}
          margen={MARGEN_MAPA}
          onSelectEstacion={setSeleccion}
          onPaso={setPaso}
          onMapa={setMapa}
          astronauta={visor ? astronauta : null}
          onClickMapa={(q) => controlVisor.current?.teletransportar(q)}
        />

        {visor && (
          <Visor3D
            mision={mision} nodos={nodos} pendienteMax={pendiente} limites={MARCO}
            onEstado={setAstronauta}
            onControl={(c) => { controlVisor.current = c; }}
            onSalir={() => setVisor(false)}
          />
        )}

        {!visor && (<>
        <button id="btn-visor" className="btn-visor primario" onClick={() => setVisor(true)} disabled={!mapa}>
          Astronaut 3D visor
        </button>
        <div className="dock-capas">
          <PanelCapas capas={capas} setCapas={setCapas} hayGeologia={!!geologia} grafoFake={!!grafo?.meta?.fake} />
        </div>
        </>)}
      </main>

      {/* ---------------- Riel derecho: ruta ---------------- */}
      <aside className="riel riel-der">
        <section className="bloque">
          <div className="fila-titulo">
            <h2 className="label-caps">Calculated route</h2>
            {mision && <span className={`chip ${mision.factible ? 'nominal' : 'critical'}`}>{mision.factible ? 'Feasible' : 'Not feasible'}</span>}
          </div>
          {mision ? (
            <>
              <p className="ruta">{mision.ruta.join(' → ')}</p>
              <dl className="resumen-ruta">
                <div><dt>Time</dt><dd>{fmt(t.tiempo_min, 1)} min</dd></div>
                <div className={t.margen_min != null && t.margen_min < 0 ? 'mal' : ''}>
                  <dt>Margin</dt><dd>{t.margen_min != null ? `${t.margen_min >= 0 ? '+' : ''}${fmt(t.margen_min, 1)} min` : 'no limit'}</dd>
                </div>
                <div><dt>Rel. dose</dt><dd>{fmt(t.dosis_rel, 1)}</dd></div>
              </dl>
              <button
                id="btn-caminata"
                className={visor ? 'ancho activo-3d' : 'ancho'}
                onClick={() => setVisor((v) => !v)}
                disabled={!mapa || !mision.tramos?.length}
              >
                {visor ? 'Exit the 3D visor' : 'Walk it in the 3D visor'}
              </button>
              {alerta && (
                <p className="nota critical">Avoids {alerta.aristas_afectadas?.join(', ')} due to dust in {alerta.zona}.</p>
              )}
              {mision.omitidas?.map((o) => (
                <p key={o.id} className="nota warning"><b>{o.id}</b> skipped: {textoMotivo(o)}.</p>
              ))}
            </>
          ) : (
            <p className="vacio">No route yet. Calculate a mission in Plan traverse.</p>
          )}
        </section>

        <section className="bloque">
          <div className="fila-titulo">
            <h2 className="label-caps">Leg sequence</h2>
            <span className="label-caps">{tramos.length} legs</span>
          </div>
          {tramos.length ? (
            <table className="tabla-tramos">
              <thead>
                <tr>
                  <th scope="col">WP</th>
                  <th scope="col">Leg</th>
                  <th scope="col" className="num">km</th>
                  <th scope="col" className="num">min</th>
                  <th scope="col" className="num">Slope</th>
                  <th scope="col" className="num">Com</th>
                </tr>
              </thead>
              <tbody>
                {tramos.map((x, i) => (
                  <tr key={i} className={i === paso ? 'activo' : ''}>
                    <td className="wp-n">{String(i + 1).padStart(2, '0')}</td>
                    <td className="par">{x.origen} → {x.destino}</td>
                    <td className="num">{fmt(x.distancia_m / 1000, 2)}</td>
                    <td className="num">{fmt(x.tiempo_min, 1)}</td>
                    <td className={`num${x.pendiente_max_deg > pendiente ? ' warning' : ''}`}>{fmt(x.pendiente_max_deg, 1)}°</td>
                    <td className="num">{fmt(x.cobertura_com_pct)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2">Total</td>
                  <td className="num">{fmt(t.distancia_m / 1000, 2)}</td>
                  <td className="num">{fmt(t.tiempo_min, 1)}</td>
                  <td className="num">{pendMax != null ? `${fmt(pendMax, 1)}°` : '—'}</td>
                  <td className="num">{comMin != null ? `${fmt(comMin)}%` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="vacio">No legs.</p>
          )}
        </section>

        {(sel || objetivo) && (
          <FichaEstacion
            key={(sel ?? objetivo).id}
            nodo={sel ?? objetivo}
            titulo={sel ? 'Selected station' : 'Primary target'}
            colorFranja={COLOR_TIPO[(sel ?? objetivo).tipo]}
            grafoFake={!!grafo?.meta?.fake}
            onVolver={sel ? () => setSeleccion(null) : null}
          />
        )}
      </aside>
    </div>
  );
}
