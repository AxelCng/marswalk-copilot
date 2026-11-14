import { useEffect, useMemo, useState } from 'react';
import MarsMap, { COLOR_TIPO } from './MarsMap.jsx';
import { getGrafo, ejemplos, postMision, postAlerta, postReset } from './api.js';
import { getGeologia } from './geologia.js';

// Consola "Geospatial Map" (AeroHUD Jezero): mapa a pantalla completa con
// barra superior, riel de planificación a la izquierda, tiles de telemetría
// sobre el mapa, riel de ruta a la derecha y control de capas abajo.
// Cada número sale de /mision, /alerta o del grafo: nada se inventa aquí.

const MISION_DEMO = { estaciones: ['E1', 'M1', 'M2', 'E2'], tiempo_max_min: 240, modo: 'orientacion', origen: 'HAB' };
const EJEMPLO_POR_PENDIENTE = { 15: ejemplos.demo1, 20: ejemplos.demo2 };
const MARGEN_MAPA = { top: 150, right: 60, bottom: 110, left: 60 };

const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;

function useRelojUTC() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t.toISOString().slice(11, 19);
}

const MOTIVO = {
  pendiente: (d) => `pendiente ${d.pendiente_max_deg}° > ${d.limite}°`,
  tiempo: (d) => `no entra en ${d.tiempo_max_min} min`,
  alerta: (d) => `aislada por alerta en ${(d.zonas ?? []).join(', ')}`,
  comms: (d) => `cobertura ${d.cobertura_com_pct}% < ${d.umbral}%`,
  no_existe: () => 'estación desconocida',
};
const textoMotivo = (o) => (MOTIVO[o.motivo]?.(o.detalle ?? {}) ?? o.motivo);

export default function App() {
  const reloj = useRelojUTC();
  const [pendiente, setPendiente] = useState(15);
  const [grafo, setGrafo] = useState(null);
  const [geologia, setGeologia] = useState(null);
  const [mision, setMision] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [estado, setEstado] = useState('Sin misión. Elige estaciones y calcula, o usa una pregunta de la demo.');
  const [seleccion, setSeleccion] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [paso, setPaso] = useState(-1);
  const [capas, setCapas] = useState({ base: true, geologia: true, aristas: true, zonas: true });
  const [elegidas, setElegidas] = useState(MISION_DEMO.estaciones);
  const [tiempoMax, setTiempoMax] = useState(MISION_DEMO.tiempo_max_min);
  const [zonaAlerta, setZonaAlerta] = useState('Z2');

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
        setMision(await postMision({ ...MISION_DEMO, estaciones: ests, tiempo_max_min: tmax, pendiente_max: pend }));
        setEstado(`Misión calculada por la API · ≤ ${pend}° · ${tmax} min`);
        return;
      } catch (e) {
        setEstado(`La API falló (${e.message}). Se muestra el ejemplo.`);
      }
    }
    const ej = EJEMPLO_POR_PENDIENTE[pend];
    if (ej) {
      setMision(ej);
      if (!usarApi) setEstado(`Sin API: ejemplo de contracts/ para ≤ ${pend}° (estaciones E1, M1, M2, E2 · 240 min).`);
    } else {
      setMision(null);
      setEstado(`Sin API no hay ejemplo para ≤ ${pend}°. Levanta engine/ para calcular.`);
    }
  }

  async function simularPolvo() {
    if (usarApi) {
      try {
        const r = await postAlerta(zonaAlerta, 'polvo');
        setMision(r);
        setAlerta({ zona: zonaAlerta, tipo: 'polvo', aristas_afectadas: r.aristas_afectadas });
        setEstado(`Alerta de polvo en ${zonaAlerta}: misión recalculada por la API.`);
        return;
      } catch (e) {
        setEstado(`La API falló (${e.message}). Se muestra el ejemplo de Z2.`);
      }
    }
    setPendiente(15);
    setMision(ejemplos.alertaZ2);
    setAlerta({ zona: 'Z2', tipo: 'polvo', aristas_afectadas: ejemplos.alertaZ2.aristas_afectadas });
    if (!usarApi) setEstado('Sin API: ejemplo de alerta de polvo en Z2 sobre la misión a 15°.');
  }

  async function reset() {
    if (usarApi) await postReset().catch(() => {});
    setMision(null);
    setAlerta(null);
    setEstado('Alertas y misión borradas.');
  }

  const t = mision?.totales;
  const tramos = mision?.tramos ?? [];
  const ritmo = t && t.tiempo_min ? (t.distancia_m / 1000) / (t.tiempo_min / 60) : null;
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
          <span className={`chip ${usarApi ? 'nominal' : 'warning'}`}>{usarApi ? 'API en línea' : 'Datos de ejemplo'}</span>
          <span className="dato"><span className="label-caps">Área</span>{grafo?.meta?.area ?? '—'}</span>
          <span className="dato"><span className="label-caps">UTC</span>{reloj}</span>
          {alerta && <span className="chip critical">Polvo · {alerta.zona}</span>}
        </div>
      </header>

      {/* ---------------- Riel izquierdo: planificación ---------------- */}
      <aside className="riel riel-izq">
        <section className="bloque">
          <h2 className="label-caps">Planificar travesía</h2>
          <fieldset className="estaciones">
            <legend className="sr">Estaciones a visitar</legend>
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
            <span className="label-caps">Tiempo máximo</span>
            <span className="input-unidad">
              <input id="tiempo-max" type="number" min="30" step="10" value={tiempoMax} onChange={(e) => setTiempoMax(Number(e.target.value))} />
              <span>min</span>
            </span>
          </label>

          <div className="campo">
            <span className="label-caps" id="lbl-pend">Pendiente máxima</span>
            <div className="segmentado" role="radiogroup" aria-labelledby="lbl-pend">
              {[15, 20, 25].map((p) => (
                <button key={p} id={`pend-${p}`} role="radio" aria-checked={pendiente === p} className={pendiente === p ? 'activo' : ''} onClick={() => setPendiente(p)}>
                  {p}°
                </button>
              ))}
            </div>
          </div>

          <button id="btn-calcular" className="primario ancho" onClick={() => calcular()} disabled={!elegidas.length}>
            Calcular ruta óptima
          </button>
        </section>

        <section className="bloque">
          <h2 className="label-caps">Preguntas de la demo</h2>
          <button id="btn-demo1" onClick={() => calcular(15, MISION_DEMO.estaciones, 240)}>1 · Delta + 2 muestreos, ≤ 15°</button>
          <button id="btn-demo2" onClick={() => calcular(20, MISION_DEMO.estaciones, 240)}>2 · ¿Y si acepto 20°?</button>
          <button id="btn-demo3" className="alerta" onClick={simularPolvo}>3 · Alerta de polvo en {zonaAlerta}</button>
        </section>

        <p className="estado">{estado}</p>
      </aside>

      {/* ---------------- Mapa ---------------- */}
      <main className="lienzo">
        <MarsMap
          grafo={grafo}
          mision={mision}
          alerta={alerta}
          geologia={geologia}
          capas={{ ...capas, geologia: capas.geologia && !!geologia }}
          margen={MARGEN_MAPA}
          onSelectEstacion={setSeleccion}
          onCursor={setCursor}
          onPaso={setPaso}
        />

        <div className="franja">
          <span className="dato"><span className="label-caps">Cursor</span>{cursor ? `${coord(cursor.lat, 'N', 'S')} ${coord(cursor.lng, 'E', 'W')}` : '—'}</span>
          <span className="dato"><span className="label-caps">Aristas</span>{grafo ? `${grafo.edges.length} ≤ ${pendiente}°` : '—'}</span>
          <span className="dato"><span className="label-caps">CRS</span>{grafo?.meta?.crs ?? '—'}</span>
        </div>

        <div className="tiles">
          <div className="tile">
            <span className="label-caps">Distancia total</span>
            <b>{fmt(t?.distancia_m)}<small>m</small></b>
            <span className="sub">{tramos.length ? `${tramos.length} tramos` : 'sin ruta'}</span>
          </div>
          <div className="tile">
            <span className="label-caps">Tiempo estimado</span>
            <b>{fmt(t?.tiempo_min, 1)}<small>min</small></b>
            <span className="sub">{ritmo ? `ritmo ${fmt(ritmo, 2)} km/h` : 'marcha + permanencia'}</span>
          </div>
          <div className="tile">
            <span className="label-caps">Dosis relativa</span>
            <b>{fmt(t?.dosis_rel, 1)}</b>
            <span className="sub">índice, no mSv</span>
          </div>
          <div className={`tile${t?.margen_min != null ? (t.margen_min >= 0 ? ' ok' : ' mal') : ''}`}>
            <span className="label-caps">Margen</span>
            <b>{t?.margen_min != null ? `${t.margen_min >= 0 ? '+' : ''}${fmt(t.margen_min, 1)}` : '—'}<small>min</small></b>
            <span className="sub">{t?.margen_min != null ? 'sobre el tope de tiempo' : 'sin tope'}</span>
          </div>
          <div className={`tile${comMin != null && comMin < 50 ? ' aviso' : ''}`}>
            <span className="label-caps">Comms mínima</span>
            <b>{fmt(comMin)}<small>%</small></b>
            <span className="sub">{pendMax != null ? `pendiente máx ${fmt(pendMax, 1)}°` : 'por tramo'}</span>
          </div>
        </div>

        <div className="capas">
          <span className="label-caps">Capas Jezero</span>
          <div className="segmentado">
            {[
              ['base', 'CTX 5 m'],
              ['geologia', 'Geología'],
              ['aristas', 'Grafo'],
              ['zonas', 'Zonas'],
            ].map(([k, txt]) => (
              <button
                key={k}
                id={`capa-${k}`}
                aria-pressed={capas[k]}
                className={capas[k] ? 'activo' : ''}
                disabled={k === 'geologia' && !geologia}
                title={k === 'geologia' && !geologia ? 'Falta geologia.geojson de data/' : undefined}
                onClick={() => setCapas((c) => ({ ...c, [k]: !c[k] }))}
              >
                {txt}
              </button>
            ))}
          </div>
          <div className="capas-acciones">
            <select id="zona-alerta" aria-label="Zona de la alerta" value={zonaAlerta} onChange={(e) => setZonaAlerta(e.target.value)}>
              {(grafo?.zonas ?? []).map((z) => <option key={z.id} value={z.id}>{z.id} · {z.nombre}</option>)}
            </select>
            <button id="btn-polvo" className="alerta" onClick={simularPolvo}>Simular polvo</button>
            <button id="btn-reset" onClick={reset}>Reset</button>
          </div>
        </div>
      </main>

      {/* ---------------- Riel derecho: ruta ---------------- */}
      <aside className="riel riel-der">
        <section className="bloque">
          <div className="fila-titulo">
            <h2 className="label-caps">Ruta calculada</h2>
            {mision && <span className={`chip ${mision.factible ? 'nominal' : 'critical'}`}>{mision.factible ? 'Factible' : 'No factible'}</span>}
          </div>
          {mision ? (
            <>
              <p className="ruta">{mision.ruta.join(' → ')}</p>
              {alerta && (
                <p className="nota critical">Evita {alerta.aristas_afectadas?.join(', ')} por polvo en {alerta.zona}.</p>
              )}
              {mision.omitidas?.map((o) => (
                <p key={o.id} className="nota warning"><b>{o.id}</b> omitida: {textoMotivo(o)}.</p>
              ))}
            </>
          ) : (
            <p className="vacio">Todavía no hay ruta. Calcula una misión en Planificar travesía.</p>
          )}
        </section>

        <section className="bloque">
          <div className="fila-titulo">
            <h2 className="label-caps">Secuencia de tramos</h2>
            <span className="label-caps">{tramos.length} vectores</span>
          </div>
          <ol className="secuencia">
            {tramos.map((x, i) => (
              <li key={i} className={i === paso ? 'activo' : ''}>
                <span className="wp">WP-{String(i + 1).padStart(2, '0')}</span>
                <span className="par">{x.origen} → {x.destino}</span>
                <span className="val">{fmt(x.distancia_m / 1000, 2)} km</span>
                <span className="val">{fmt(x.tiempo_min, 1)} min</span>
                <span className={`val${x.pendiente_max_deg > pendiente ? ' warning' : ''}`}>{fmt(x.pendiente_max_deg, 1)}°</span>
              </li>
            ))}
          </ol>
        </section>

        {(sel || objetivo) && (
          <section className="bloque ficha" style={{ '--franja': COLOR_TIPO[(sel ?? objetivo).tipo] }}>
            <div className="fila-titulo">
              <h2 className="label-caps">{sel ? 'Estación seleccionada' : 'Objetivo primario'}</h2>
              <span className="chip">Valor {(sel ?? objetivo).valor_cientifico}</span>
            </div>
            <h3>{(sel ?? objetivo).id} · {(sel ?? objetivo).nombre}</h3>
            <p>{(sel ?? objetivo).tarea} · {(sel ?? objetivo).permanencia_min} min</p>
            <dl>
              <dt className="label-caps">Elevación</dt><dd>{fmt((sel ?? objetivo).capas?.elev_m)} m</dd>
              <dt className="label-caps">Pendiente</dt><dd>{fmt((sel ?? objetivo).capas?.pendiente_deg, 1)}°</dd>
              <dt className="label-caps">Posición</dt><dd>{coord((sel ?? objetivo).lat, 'N', 'S')} {coord((sel ?? objetivo).lon, 'E', 'W')}</dd>
              {(sel ?? objetivo).unidad_geologica && (<><dt className="label-caps">Unidad</dt><dd>{(sel ?? objetivo).unidad_geologica}</dd></>)}
            </dl>
            {sel && <button className="ancho" onClick={() => setSeleccion(null)}>Volver al objetivo</button>}
          </section>
        )}
      </aside>
    </div>
  );
}
