import { useEffect, useState } from 'react';
import MarsMap, { COLOR_TIPO } from './MarsMap.jsx';
import { getGrafo, ejemplos, postMision, postAlerta, postReset } from './api.js';
import { getGeologia } from './geologia.js';

// Banco de pruebas del mapa: reproduce las 3 preguntas de la demo
// con la API (si está) o con los ejemplos de contracts/ejemplos/.

const MISION_DEMO = {
  estaciones: ['E1', 'M1', 'M2', 'E2'],
  tiempo_max_min: 240,
  modo: 'orientacion',
  origen: 'HAB',
};

export default function App() {
  const [pendiente, setPendiente] = useState(15);
  const [grafo, setGrafo] = useState(null);
  const [mision, setMision] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [estado, setEstado] = useState('');
  const [seleccion, setSeleccion] = useState(null);

  const [geologia, setGeologia] = useState(null);
  const [verGeologia, setVerGeologia] = useState(true);

  useEffect(() => {
    getGrafo(pendiente).then(setGrafo);
  }, [pendiente]);

  useEffect(() => {
    getGeologia().then(setGeologia);
  }, []);

  const usarApi = grafo?.fuente === 'api';

  async function pedirMision(pend, ejemplo) {
    setAlerta(null);
    setPendiente(pend);
    try {
      if (!usarApi) throw new Error('sin API');
      setMision(await postMision({ ...MISION_DEMO, pendiente_max: pend }));
      setEstado(`/mision ${pend}° (API)`);
    } catch {
      setMision(ejemplo);
      setEstado(`/mision ${pend}° (ejemplo)`);
    }
  }

  async function lanzarAlerta(zona) {
    setPendiente(15);
    try {
      if (!usarApi) throw new Error('sin API');
      const r = await postAlerta(zona, 'polvo');
      setMision(r);
      setAlerta({ zona, aristas_afectadas: r.aristas_afectadas });
      setEstado(`/alerta ${zona} (API)`);
    } catch {
      const r = ejemplos.alertaZ2;
      setMision(r);
      setAlerta({ zona: 'Z2', aristas_afectadas: r.aristas_afectadas });
      setEstado('/alerta Z2 (ejemplo)');
    }
  }

  async function reset() {
    if (usarApi) await postReset().catch(() => {});
    setMision(null);
    setAlerta(null);
    setEstado('reset');
  }

  const t = mision?.totales;

  return (
    <div className="app">
      <MarsMap
        grafo={grafo}
        mision={mision}
        alerta={alerta}
        geologia={geologia}
        mostrarGeologia={verGeologia}
        onSelectEstacion={setSeleccion}
      />

      <aside className={`panel${alerta ? ' alerta-activa' : ''}`}>
        <div>
          <h1>MarsWalk · Jezero</h1>
          <p className="fuente label-caps">
            {grafo?.fuente === 'api' ? 'API' : 'graph_fake.json'}
            {grafo && ` · ${grafo.edges.length} aristas ≤ ${pendiente}°`}
          </p>
        </div>

        <div className="botones">
          <button id="btn-demo1" className="primario" onClick={() => pedirMision(15, ejemplos.demo1)}>Misión ≤ 15°</button>
          <button id="btn-demo2" onClick={() => pedirMision(20, ejemplos.demo2)}>¿Y con 20°?</button>
          <button id="btn-alerta" className="alerta" onClick={() => lanzarAlerta('Z2')}>Polvo en Z2</button>
          <button id="btn-reset" onClick={reset}>Reset</button>
        </div>

        <label className="pend label-caps" htmlFor="sel-pendiente">
          Aristas visibles
          <select id="sel-pendiente" value={pendiente} onChange={(e) => setPendiente(Number(e.target.value))}>
            {[15, 20, 25].map((p) => <option key={p} value={p}>≤ {p}°</option>)}
          </select>
        </label>

        <div className="geo">
          <label className="pend label-caps" htmlFor="chk-geologia">
            Geología SIM 3464
            <input
              id="chk-geologia"
              type="checkbox"
              checked={verGeologia}
              disabled={!geologia}
              onChange={(e) => setVerGeologia(e.target.checked)}
            />
          </label>
          {!geologia && <p className="estado">Sin capa: falta geologia.geojson (data/) o GET /geologia.</p>}
          {geologia && verGeologia && (
            <ul className="geo-leyenda">
              {geologia.leyenda.slice(0, 8).map((u) => (
                <li key={u.clave}>
                  <i style={{ background: u.color }} />
                  <b>{u.simbolo}</b>
                  <span>{u.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {mision && (
          <div className="resumen">
            <div className="ruta">{mision.ruta.join(' → ')}</div>
            {t && (
              <div className="totales">
                <div><span className="label-caps">Distancia</span><b>{(t.distancia_m / 1000).toFixed(2)}</b><span className="label-caps">km</span></div>
                <div><span className="label-caps">Tiempo</span><b>{t.tiempo_min.toFixed(1)}</b><span className="label-caps">min</span></div>
                {t.margen_min != null && (
                  <div><span className="label-caps">Margen</span><b>{t.margen_min.toFixed(1)}</b><span className="label-caps">min</span></div>
                )}
              </div>
            )}
            <div className="chips">
              {mision.omitidas?.map((o) => (
                <span key={o.id} className="chip warning">
                  {o.id} omitida · {o.motivo}
                  {o.detalle?.pendiente_max_deg != null && ` ${o.detalle.pendiente_max_deg}° > ${o.detalle.limite}°`}
                </span>
              ))}
              {alerta && (
                <span className="chip critical">
                  Polvo {alerta.zona} · evita {alerta.aristas_afectadas?.join(', ')}
                </span>
              )}
            </div>
          </div>
        )}

        {seleccion && <p className="sel">SELECCIÓN · {seleccion}</p>}
        {estado && <p className="estado">{estado}</p>}

        <ul className="leyenda">
          {Object.entries(COLOR_TIPO).map(([tipo, color]) => (
            <li key={tipo}><i style={{ background: color }} />{tipo}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
