import { useEffect, useMemo, useRef, useState } from 'react';
import { iniciarVisor, MARCHA, rumboEntre } from './visor3d.js';
import { crearEscena } from './escena3d.js';
import { CAMARAS, R_MARTE } from './caminata.js';
import { COLOR_TIPO, HUD } from './tokens.js';

const VELOCIDADES = [10, 60, 300];
const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d }));
const rad = (d) => (d * Math.PI) / 180;

function distancia([lo1, la1], [lo2, la2]) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * R_MARTE * Math.asin(Math.sqrt(a));
}

/** Cinta de rumbo: ±60° alrededor del rumbo actual. */
function Cinta({ r }) {
  const marcas = [];
  for (let d = Math.ceil((r - 60) / 10) * 10; d <= r + 60; d += 10) {
    const g = ((d % 360) + 360) % 360;
    marcas.push(
      <span key={d} className={g % 30 === 0 ? 'mayor' : ''} style={{ left: `${50 + ((d - r) / 120) * 100}%` }}>
        {g % 30 === 0 && <b>{g % 90 === 0 ? PUNTOS[g / 45] : String(g).padStart(3, '0')}</b>}
      </span>,
    );
  }
  return (
    <div className="v3d-cinta" aria-label={`Heading ${Math.round(r)}°`}>
      <div className="v3d-cinta-escala">{marcas}</div>
      <div className="v3d-cinta-valor">{String(Math.round(r) % 360).padStart(3, '0')}° {PUNTOS[Math.round(r / 45) % 8]}</div>
    </div>
  );
}

/**
 * Visor 3D del astronauta (three.js sobre la DTM). onEstado informa posición y rumbo a la app
 * para que el mapa del tablero lo muestre en vivo; onControl entrega el control (teletransportar).
 */
export default function Visor3D({ mision, nodos, pendienteMax, limites, onEstado, onControl, onSalir }) {
  const lienzo = useRef(null);
  const control = useRef(null);
  const [est, setEst] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cam, setCam] = useState('ojos');
  const [vel, setVel] = useState(60);
  const tramos = mision?.tramos ?? [];
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;

  const inicio = useMemo(() => {
    const hab = nodos.HAB ?? Object.values(nodos)[0];
    const pos = tramos[0]?.geometria[0] ?? (hab ? [hab.lon, hab.lat] : [77.45089, 18.44463]);
    const hacia = tramos[0]?.geometria[1];
    return { pos, rumbo: hacia ? rumboEntre(pos, hacia) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const escena = crearEscena(lienzo.current, { origen: inicio.pos });
    escena.ponerEstaciones(Object.values(nodos).map((n) => ({ ...n, color: COLOR_TIPO[n.tipo] ?? HUD.onSurface })));
    escena.listo.then(() => setCargando(false));
    const c = iniciarVisor({
      elemento: lienzo.current,
      pos: inicio.pos, rumbo: inicio.rumbo, camara: cam, limites,
      onCuadro: (e) => escena.actualizar(e),
      onEstado: (e) => { setEst(e); onEstadoRef.current?.(e); },
    });
    control.current = c;
    control.current.escena = escena;
    onControl?.(c);
    const esc = (e) => { if (e.key === 'Escape') onSalir(); };
    window.addEventListener('keydown', esc);
    return () => {
      c.destruir();
      escena.destruir();
      control.current = null;
      onControl?.(null);
      onEstadoRef.current?.(null);
      window.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { control.current?.escena?.ponerRuta(tramos); }, [mision, cargando]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { control.current?.camara(cam); }, [cam]);
  useEffect(() => { control.current?.pilotoVel(vel); }, [vel]);

  const cercana = useMemo(() => {
    if (!est?.pos) return null;
    let mejor = null;
    for (const n of Object.values(nodos)) {
      const d = distancia(est.pos, [n.lon, n.lat]);
      if (!mejor || d < mejor.d) mejor = { n, d, r: rumboEntre(est.pos, [n.lon, n.lat]) };
    }
    return mejor;
  }, [est, nodos]);

  const pend = est?.pendiente_deg;
  const clasePend = est?.bloqueado ? 'critico' : pend != null && Math.abs(pend) > pendienteMax ? 'aviso' : '';
  const pil = est?.piloto;

  return (
    <div className="v3d">
      <div ref={lienzo} className="v3d-lienzo" tabIndex={0} aria-label="First-person 3D view. WASD to move, drag to look around." />
      {cargando && <p className="v3d-cargando label-caps">Loading DTM terrain…</p>}
      <Cinta r={est?.rumbo ?? inicio.rumbo} />
      <div className="v3d-reticula" aria-hidden="true" />

      <section className="v3d-panel" aria-label="Visor readings">
        <header>
          <span className="label-caps">Astronaut visor</span>
          <button onClick={onSalir} aria-label="Exit the visor (Esc)">Exit</button>
        </header>
        <dl className="v3d-datos">
          <div><dt>Elevation</dt><dd>{fmt(est?.elev_m)} m</dd></div>
          <div className={clasePend}><dt>Slope</dt><dd>{pend != null ? `${pend > 0 ? '+' : ''}${fmt(pend, 1)}°` : '—'}</dd></div>
          <div><dt>Pace</dt><dd>{fmt(est?.velocidad_kmh, 1)} km/h</dd></div>
          <div className="ancho"><dt>Position</dt><dd>{est?.pos ? `${est.pos[1].toFixed(5)}°N ${est.pos[0].toFixed(5)}°E` : '—'}</dd></div>
          <div className="ancho"><dt>Nearest station</dt><dd>{cercana ? `${cercana.n.id} · ${fmt(cercana.d)} m · ${String(Math.round(cercana.r)).padStart(3, '0')}°` : '—'}</dd></div>
        </dl>
        {est?.bloqueado && <p className="v3d-alerta">Slope above {MARCHA.thetaMax}°: terrain blocked</p>}
        {!est?.bloqueado && clasePend === 'aviso' && <p className="v3d-aviso">Above the chosen maximum slope ({pendienteMax}°)</p>}

        <div className="segmentado" role="radiogroup" aria-label="Camera">
          {Object.entries(CAMARAS).map(([k, v]) => (
            <button key={k} role="radio" aria-checked={cam === k} className={cam === k ? 'activo' : ''} onClick={() => setCam(k)}>{v.nombre}</button>
          ))}
        </div>

        {tramos.length > 0 && (
          <div className="v3d-piloto">
            {!pil ? (
              <button className="primario" onClick={() => control.current?.seguirRuta(tramos, vel)}>Follow the calculated route</button>
            ) : (
              <>
                <span className="label-caps">Autopilot · leg {pil.idx + 1}/{tramos.length} · {tramos[pil.idx].origen} → {tramos[pil.idx].destino}</span>
                <div className="v3d-piloto-ctrl">
                  <button onClick={() => control.current?.pilotoTramo(pil.idx - 1)} disabled={pil.idx === 0} aria-label="Previous leg">◀</button>
                  <button className="primario" onClick={() => control.current?.pilotoPausa(!pil.enMarcha)}>{pil.enMarcha ? 'Pause' : 'Resume'}</button>
                  <button onClick={() => control.current?.pilotoTramo(pil.idx + 1)} disabled={pil.idx >= tramos.length - 1} aria-label="Next leg">▶</button>
                  <div className="segmentado" role="radiogroup" aria-label="Autopilot speed">
                    {VELOCIDADES.map((v) => (
                      <button key={v} role="radio" aria-checked={vel === v} className={vel === v ? 'activo' : ''} onClick={() => setVel(v)}>×{v}</button>
                    ))}
                  </div>
                </div>
                <div className="caminata-barra"><i style={{ width: `${(pil.frac ?? 0) * 100}%` }} /></div>
              </>
            )}
          </div>
        )}
        <p className="v3d-ayuda">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Q</kbd><kbd>E</kbd> turn · drag to look · <kbd>Shift</kbd> ×10
        </p>
        <p className="v3d-nota">
          Terrain DTM CTX 20 m (USGS SIM 3464) at 1:1 scale · Tobler pace × {fmt(MARCHA.factor, 2)} (params.yaml) · click the map to move
        </p>
      </section>
    </div>
  );
}
