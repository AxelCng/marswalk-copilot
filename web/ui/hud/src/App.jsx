import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cargarGrafo, cargarMision, dispararAlerta, resetear, ALERTA_DEMO } from './api.js';
import { rumboTramo, delta, norm } from './geo.js';
import HeadingTape from './components/HeadingTape.jsx';
import Reticle from './components/Reticle.jsx';
import TargetLock from './components/TargetLock.jsx';
import MissionPanel from './components/MissionPanel.jsx';
import AlertStrip from './components/AlertStrip.jsx';
import MiniMap from './components/MiniMap.jsx';

// Campo visual horizontal del visor, en grados. Fija cuántos px es un grado en pantalla.
const FOV = 60;
const DESVIO_MAX = 120;

function useAncho() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export default function App() {
  const [grafo, setGrafo] = useState(null);
  const [mision, setMision] = useState(null);
  const [misionPrevia, setMisionPrevia] = useState(null);
  const [fuente, setFuente] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [idx, setIdx] = useState(0);
  const [desvio, setDesvio] = useState(0); // vista − rumbo al objetivo, en grados
  const [cargando, setCargando] = useState(false);
  const [fotoFallo, setFotoFallo] = useState({});
  const ancho = useAncho();
  const pxPorGrado = ancho / FOV;

  useEffect(() => {
    Promise.all([cargarGrafo(), cargarMision()]).then(([g, m]) => {
      setGrafo(g);
      setMision(m.mision);
      setFuente(m.fuente);
    });
  }, []);

  const nodos = useMemo(() => Object.fromEntries((grafo?.nodos ?? []).map((n) => [n.id, n])), [grafo]);
  const tramos = mision?.tramos ?? [];
  const tramo = tramos[idx];
  const destino = tramo ? nodos[tramo.destino] : null;
  const objetivo = tramo ? rumboTramo(tramo) : 0;
  const vista = norm(objetivo + desvio);
  const foto = destino?.fotos?.[0] ?? null;
  const fotoUrl = foto?.url && !fotoFallo[foto.url] ? foto.url : null;

  const irA = useCallback(
    (i) => {
      if (!tramos.length) return;
      setIdx(Math.max(0, Math.min(tramos.length - 1, i)));
      setDesvio(0);
    },
    [tramos.length],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') irA(idx + 1);
      else if (e.key === 'ArrowLeft') irA(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, irA]);

  async function toggleAlerta() {
    setCargando(true);
    if (alerta) {
      const m = await resetear(fuente);
      setMision(m.mision);
      setFuente(m.fuente);
      setMisionPrevia(null);
      setAlerta(null);
    } else {
      const m = await dispararAlerta(fuente);
      setMisionPrevia(mision);
      setMision(m.mision);
      setFuente(m.fuente);
      setAlerta(ALERTA_DEMO);
    }
    // La API recalcula la misión entera desde el origen: se vuelve al tramo 1.
    setIdx(0);
    setDesvio(0);
    setCargando(false);
  }

  // Arrastrar la escena gira la cabeza (solo la vista; el rumbo al objetivo no cambia).
  const drag = useRef(null);
  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    drag.current = { x: e.clientX, d: desvio };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current.d - (e.clientX - drag.current.x) / pxPorGrado;
    setDesvio(Math.max(-DESVIO_MAX, Math.min(DESVIO_MAX, d)));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  if (!mision || !grafo) {
    return (
      <div className="hud">
        <p className="cargando label-caps">Enlazando visor…</p>
      </div>
    );
  }

  const zonaAlerta = alerta ? grafo.zonas.find((z) => z.id === alerta.zona) : null;
  const paralaje = Math.max(-0.1, Math.min(0.1, (-desvio * pxPorGrado * 0.35) / ancho));

  return (
    <div
      className={`hud${alerta ? ' hud-alerta' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="escena" aria-hidden={!fotoUrl}>
        {fotoUrl ? (
          <img
            key={fotoUrl}
            src={fotoUrl}
            alt={`Navcam en ${destino.id}, ${destino.nombre}`}
            draggable={false}
            style={{ transform: `scale(1.25) translateX(${paralaje * 100}%)` }}
            onError={() => setFotoFallo((f) => ({ ...f, [foto.url]: true }))}
          />
        ) : (
          <div className="sin-foto">
            <span className="label-caps">Sin imagen Navcam para {tramo?.destino ?? '—'}</span>
            <span className="sin-foto-sub">
              {foto?.url ? 'La foto no cargó.' : 'El nodo no tiene foto (fotos[0].url es null).'}
            </span>
          </div>
        )}
      </div>
      <div className="tinte" />
      <div className="visor" />

      <HeadingTape vista={vista} objetivo={objetivo} idObjetivo={tramo.destino} />
      <Reticle pendiente={tramo.pendiente_max_deg} />
      <TargetLock
        tramo={tramo}
        nodo={destino}
        rumbo={objetivo}
        dx={delta(vista, objetivo) * pxPorGrado}
        ancho={ancho}
        onCentrar={() => setDesvio(0)}
      />

      <MissionPanel mision={mision} idx={idx} fuente={fuente} />

      <div className="abajo-izq">
        {alerta && (
          <AlertStrip alerta={alerta} zona={zonaAlerta} mision={mision} />
        )}
        {foto && fotoUrl && (
          <p className="credito">
            {foto.camara} · SOL {foto.sol} · {foto.credito}
          </p>
        )}
      </div>

      <MiniMap
        mision={mision}
        misionPrevia={misionPrevia}
        alerta={alerta}
        zona={zonaAlerta}
        idx={idx}
        nodos={nodos}
      />

      <nav className="controles" aria-label="Navegación por tramos">
        <button onClick={() => irA(idx - 1)} disabled={idx === 0}>
          ◀ Anterior
        </button>
        <button className="primario" onClick={() => irA(idx + 1)} disabled={idx >= tramos.length - 1}>
          Siguiente ▶
        </button>
        <button className={alerta ? '' : 'alerta'} onClick={toggleAlerta} disabled={cargando}>
          {alerta ? 'Quitar alerta' : `Alerta ${ALERTA_DEMO.tipo} ${ALERTA_DEMO.zona}`}
        </button>
      </nav>
    </div>
  );
}
