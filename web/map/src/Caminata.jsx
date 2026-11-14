import { useEffect, useRef, useState } from 'react';
import { iniciarCaminata, K_ESCALA, CAMARAS } from './caminata.js';

const VELOCIDADES = [10, 60, 300];
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));

/**
 * Panel del modo caminata 3D. La cámara la mueve caminata.js; acá solo se muestra el
 * avance con cifras del tramo (distancia_m, tiempo_min, pendiente_max_deg de la API).
 */
export default function Caminata({ map, mision, nodos, onSalir }) {
  const control = useRef(null);
  const [vel, setVel] = useState(60);
  const [cam, setCam] = useState('ojos');
  const [prog, setProg] = useState({ idx: 0, frac: 0, enMarcha: true, terminado: false });
  const tramos = mision.tramos;

  useEffect(() => {
    if (!map || !tramos.length) return undefined;
    const [lon, lat] = tramos[0].geometria[0];
    map.jumpTo({ center: [lon, lat], zoom: 16, pitch: 70 });
    let c = null;
    const t = setTimeout(() => {
      c = iniciarCaminata(map, tramos, { velocidad: vel, camara: cam, onProgreso: setProg });
      control.current = c;
    }, 400); // deja que el terreno pida sus teselas
    return () => { clearTimeout(t); c?.destruir(); control.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mision]);

  useEffect(() => { control.current?.velocidad(vel); }, [vel]);
  useEffect(() => { control.current?.camara(cam); }, [cam]);

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onSalir();
      if (e.key === ' ') { e.preventDefault(); prog.enMarcha ? control.current?.pausa() : control.current?.play(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onSalir, prog.enMarcha]);

  const tr = tramos[prog.idx];
  const destino = nodos[tr.destino];

  return (
    <section className="caminata" aria-label="Caminata 3D">
      <header className="caminata-cab">
        <span className="label-caps">Caminata 3D · Tramo {prog.idx + 1} / {tramos.length}</span>
        <button onClick={onSalir} aria-label="Salir de la caminata (Esc)">Salir</button>
      </header>
      <p className="caminata-par">
        <b>{tr.origen}</b> → <b>{tr.destino}</b>
        {destino && <span> {destino.nombre}</span>}
      </p>
      <div className="caminata-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(prog.frac * 100)}>
        <i style={{ width: `${prog.frac * 100}%` }} />
      </div>
      <dl className="caminata-datos">
        <div><dt>Recorrido</dt><dd>{fmt(prog.frac * tr.distancia_m)} / {fmt(tr.distancia_m)} m</dd></div>
        <div><dt>Marcha</dt><dd>{fmt(prog.frac * tr.tiempo_min, 1)} / {fmt(tr.tiempo_min, 1)} min</dd></div>
        <div><dt>Pend. máx</dt><dd>{fmt(tr.pendiente_max_deg, 1)}°</dd></div>
      </dl>
      <div className="caminata-controles">
        <button onClick={() => control.current?.irA(prog.idx - 1)} disabled={prog.idx === 0} aria-label="Tramo anterior">◀</button>
        {prog.enMarcha ? (
          <button className="primario" onClick={() => control.current?.pausa()}>Pausa</button>
        ) : (
          <button className="primario" onClick={() => control.current?.play()}>{prog.terminado ? 'Repetir' : 'Seguir'}</button>
        )}
        <button onClick={() => control.current?.irA(prog.idx + 1)} disabled={prog.idx >= tramos.length - 1} aria-label="Tramo siguiente">▶</button>
        <div className="segmentado" role="radiogroup" aria-label="Velocidad de simulación">
          {VELOCIDADES.map((v) => (
            <button key={v} role="radio" aria-checked={vel === v} className={vel === v ? 'activo' : ''} onClick={() => setVel(v)}>×{v}</button>
          ))}
        </div>
      </div>
      <div className="segmentado caminata-camaras" role="radiogroup" aria-label="Cámara">
        {Object.entries(CAMARAS).map(([k, v]) => (
          <button key={k} role="radio" aria-checked={cam === k} className={cam === k ? 'activo' : ''} onClick={() => setCam(k)}>{v.nombre}</button>
        ))}
      </div>
      <p className="caminata-nota">
        Terreno DTM CTX 20 m (USGS SIM 3464) · relieve ×{fmt(K_ESCALA, 2)} para escala real de Marte
      </p>
    </section>
  );
}
