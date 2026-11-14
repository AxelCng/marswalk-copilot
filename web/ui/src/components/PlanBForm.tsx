import React, { useState } from 'react';
import type { EstacionDetalle, PlanBParams, RespuestaMision } from '../types/mission';
import { api, ApiError } from '../services/api';
import { MOCK_ALERTA_Z2, MOCK_MISION_15DEG, MOCK_MISION_20DEG } from '../mocks/mockData';
import { ShieldCheck, Send, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface PlanBFormProps {
  stations: EstacionDetalle[];
  /** Zonas de alerta del grafo (GET /grafo). */
  zonas?: { id: string; nombre: string }[];
  onMissionCalculated: (res: RespuestaMision) => void;
  /** Si viene, la alerta se muestra como alerta (zona roja + tramos evitados) en el mapa. */
  onAlertaCalculada?: (res: RespuestaMision, zona: string) => void;
  /** Tras /reset: el resto de la pantalla limpia la misión y la alerta. */
  onReset?: () => void;
}

type Tono = 'info' | 'warning' | 'critical';

const PENDIENTES = [15, 20, 25] as const;
// Las 3 preguntas de la demo (spec), para hacerlas sin LLM. Son las de contracts/ejemplos.
const MISION_DEMO = { estaciones: ['E1', 'M1', 'M2', 'E2'], tiempo_max_min: 240, modo: 'orientacion' as const };
const EJEMPLO_POR_PENDIENTE: Record<number, RespuestaMision> = { 15: MOCK_MISION_15DEG, 20: MOCK_MISION_20DEG };

/** Sin conexión (fetch rechazado), a diferencia de un error que la API sí respondió. */
const sinConexion = (e: unknown) => !(e instanceof ApiError);
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const PlanBForm: React.FC<PlanBFormProps> = ({ stations, zonas = [], onMissionCalculated, onAlertaCalculada, onReset }) => {
  const [selectedStations, setSelectedStations] = useState<string[]>(MISION_DEMO.estaciones);
  const [pendienteMax, setPendienteMax] = useState<number>(15);
  const [tiempoMax, setTiempoMax] = useState<number>(MISION_DEMO.tiempo_max_min); // params.yaml: tiempo_max_min_default
  const [sinTope, setSinTope] = useState(false);
  const [modo, setModo] = useState<'orientacion' | 'tsp'>('orientacion');
  const [zona, setZona] = useState('Z2');
  const [loading, setLoading] = useState<boolean>(false);
  const [alertaLoading, setAlertaLoading] = useState<boolean>(false);
  const [estado, setEstado] = useState<{ texto: string; tono: Tono }>({
    texto: 'Elige estaciones y restricciones, o usa una pregunta de la demo.',
    tono: 'info',
  });

  const toggleStation = (id: string) => {
    setSelectedStations((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const calcular = async (params: PlanBParams) => {
    setLoading(true);
    try {
      const result = await api.postMision(params);
      onMissionCalculated(result);
      const tope = params.tiempo_max_min == null ? 'sin tope' : `${params.tiempo_max_min} min`;
      setEstado({
        texto: `${api.useMock ? 'Modo prueba' : 'Motor'}: ${params.estaciones.length} estaciones · ≤ ${params.pendiente_max}° · ${tope} · ${params.modo}.`,
        tono: 'info',
      });
    } catch (err) {
      console.error('Plan B /mision:', err);
      const ejemplo = EJEMPLO_POR_PENDIENTE[params.pendiente_max];
      if (sinConexion(err) && ejemplo) {
        // Igual que la consola de Añe: sin motor, se muestra el ejemplo oficial de contracts/ y se dice.
        onMissionCalculated(ejemplo);
        setEstado({
          texto: `Sin conexión con el motor. Se muestra el ejemplo de contracts/ para ≤ ${params.pendiente_max}° (E1, M1, M2, E2 · 240 min), no tu selección.`,
          tono: 'warning',
        });
      } else {
        setEstado({ texto: `No se pudo calcular: ${mensaje(err)}`, tono: 'critical' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = () => calcular({
    estaciones: selectedStations,
    tiempo_max_min: modo === 'tsp' && sinTope ? null : tiempoMax,
    pendiente_max: pendienteMax,
    modo,
    origen: 'HAB',
  });

  const pregunta = (pend: number) => {
    setSelectedStations(MISION_DEMO.estaciones);
    setTiempoMax(MISION_DEMO.tiempo_max_min);
    setSinTope(false);
    setModo(MISION_DEMO.modo);
    setPendienteMax(pend);
    return calcular({ ...MISION_DEMO, pendiente_max: pend, origen: 'HAB' });
  };

  const handleTriggerAlert = async (z = zona) => {
    setAlertaLoading(true);
    try {
      const result = await api.postAlerta(z, 'polvo');
      if (onAlertaCalculada) onAlertaCalculada(result, z);
      else onMissionCalculated(result);
      const ev = result.aristas_afectadas ?? [];
      setEstado({
        texto: `Polvo en ${z}: ${ev.length ? `evitados ${ev.join(', ')}` : 'la ruta no cruzaba la zona'}.`,
        tono: 'critical',
      });
    } catch (err) {
      console.error('Plan B /alerta:', err);
      if (err instanceof ApiError && err.status === 409) {
        setEstado({ texto: 'Primero calcula una misión: la alerta recalcula la última.', tono: 'warning' });
      } else if (sinConexion(err) && z === 'Z2') {
        onAlertaCalculada?.(MOCK_ALERTA_Z2, 'Z2');
        setEstado({ texto: 'Sin conexión con el motor. Se muestra el ejemplo de alerta en Z2 de contracts/ (sobre la misión a 15°).', tono: 'warning' });
      } else {
        setEstado({ texto: `No se pudo recalcular: ${mensaje(err)}`, tono: 'critical' });
      }
    } finally {
      setAlertaLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await api.resetAlerta();
      setEstado({ texto: 'Alertas borradas. Calcula de nuevo la misión.', tono: 'info' });
    } catch (err) {
      setEstado({ texto: `Reset sin motor (${mensaje(err)}): solo se limpió la pantalla.`, tono: 'warning' });
    }
    onReset?.();
  };

  const candidateStations = stations.filter((s) => s.tipo !== 'habitat');
  const ocupado = loading || alertaLoading;

  return (
    <div className="panel p-4 flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-hud-cyan" />
          <div>
            <h3 className="m-0 font-display text-base font-semibold text-ink">Plan B · Misión manual</h3>
            <span className="label-caps">Cálculo directo por el motor de grafos, sin LLM</span>
          </div>
        </div>
        <span className="chip warning">Respaldo demo</span>
      </div>

      {/* Preguntas de la demo */}
      <section className="bloque">
        <h4 className="label-caps m-0">Preguntas de la demo</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" className="btn !justify-start" disabled={ocupado} onClick={() => pregunta(15)}>
            1 · Delta + 2 muestreos, ≤ 15°
          </button>
          <button type="button" className="btn !justify-start" disabled={ocupado} onClick={() => pregunta(20)}>
            2 · ¿Y si acepto 20°?
          </button>
          <button type="button" className="btn alerta !justify-start" disabled={ocupado} onClick={() => { setZona('Z2'); handleTriggerAlert('Z2'); }}>
            3 · Alerta de polvo en Z2
          </button>
        </div>
      </section>

      {/* Estaciones */}
      <section className="bloque">
        <div className="flex items-center justify-between">
          <h4 className="label-caps m-0">Estaciones a visitar</h4>
          <span className="font-mono text-[11px] text-hud-cyan">{selectedStations.length} seleccionadas</span>
        </div>

        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 border-0 m-0 p-0">
          <legend className="sr-only">Estaciones a visitar</legend>
          {candidateStations.map((station) => {
            const isChecked = selectedStations.includes(station.id);
            return (
              <label
                key={station.id}
                className={`grid grid-cols-[14px_8px_2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-hud-cyan/5 ${isChecked ? 'text-ink' : 'text-ink-dim'}`}
              >
                <input type="checkbox" checked={isChecked} onChange={() => toggleStation(station.id)} className="h-3.5 w-3.5 m-0" />
                <i className="h-2 w-2 rounded-full" style={{ background: `var(--tipo-${station.tipo})` }} aria-hidden />
                <b className="font-mono text-xs font-semibold">{station.id}</b>
                <span className="text-xs truncate">{station.nombre}</span>
                <span className="font-mono text-[10px] text-ink-mute dato-num" title="Valor científico · pendiente local">
                  {station.valor_cientifico > 0 ? `+${station.valor_cientifico}` : ''} · {station.capas.pendiente_deg}°
                </span>
              </label>
            );
          })}
        </fieldset>
      </section>

      {/* Restricciones */}
      <section className="bloque">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="label-caps" id="lbl-pend">Pendiente máxima del traje</span>
            <div className="segmentado" role="radiogroup" aria-labelledby="lbl-pend">
              {PENDIENTES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={pendienteMax === p}
                  onClick={() => setPendienteMax(p)}
                  className={pendienteMax === p ? 'activo' : ''}
                >
                  {p}°
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label-caps" htmlFor="planb-tiempo">Tiempo máximo</label>
            <span className={`flex items-center bg-hud-glass/90 border border-hud-border rounded focus-within:border-hud-cyan ${modo === 'tsp' && sinTope ? 'opacity-45' : ''}`}>
              <input
                id="planb-tiempo"
                type="number"
                min={30}
                max={600}
                step={10}
                value={tiempoMax}
                disabled={modo === 'tsp' && sinTope}
                onChange={(e) => setTiempoMax(Math.max(30, Number(e.target.value) || 30))}
                className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 outline-none text-ink font-mono text-sm dato-num"
              />
              <span className="pr-2 font-mono text-[11px] text-ink-mute">min · {(tiempoMax / 60).toFixed(1)} h</span>
            </span>
            {modo === 'tsp' && (
              <label className="flex items-center gap-1.5 text-[11px] font-mono text-ink-dim cursor-pointer">
                <input type="checkbox" checked={sinTope} onChange={(e) => setSinTope(e.target.checked)} className="h-3.5 w-3.5 m-0" />
                Sin tope de tiempo
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label-caps" id="lbl-modo">Algoritmo</span>
          <div className="segmentado" role="radiogroup" aria-labelledby="lbl-modo">
            <button type="button" role="radio" aria-checked={modo === 'orientacion'} onClick={() => setModo('orientacion')} className={modo === 'orientacion' ? 'activo' : ''}>
              Orientación · máx. ciencia
            </button>
            <button type="button" role="radio" aria-checked={modo === 'tsp'} onClick={() => setModo('tsp')} className={modo === 'tsp' ? 'activo' : ''}>
              TSP · todas
            </button>
          </div>
          <span className="text-[11px] text-ink-mute">
            {modo === 'orientacion'
              ? 'Maximiza el valor científico dentro del tiempo y omite las que no entran.'
              : 'Visita todas en el mejor orden, o responde que no es factible.'}
          </span>
        </div>
      </section>

      {/* Acciones */}
      <section className="bloque">
        <button
          type="button"
          onClick={handleCalculate}
          disabled={ocupado || selectedStations.length === 0}
          className="btn primario w-full"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Calcular ruta óptima
        </button>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <select
            aria-label="Zona de la alerta"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            className="min-w-0 min-h-[34px] px-1 bg-hud-glass/90 border border-hud-border rounded text-ink font-mono text-xs"
          >
            {(zonas.length ? zonas : [{ id: 'Z2', nombre: '' }]).map((z) => (
              <option key={z.id} value={z.id}>{z.id}{z.nombre ? ` · ${z.nombre}` : ''}</option>
            ))}
          </select>
          <button type="button" onClick={() => handleTriggerAlert()} disabled={ocupado} className="btn alerta">
            {alertaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />} Simular polvo
          </button>
          <button type="button" onClick={handleReset} disabled={ocupado} title="Quita las alertas (POST /reset)" className="btn">
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
        <p
          role="status"
          className={estado.tono === 'info' ? 'm-0 font-mono text-[11px] leading-[14px] text-ink-mute' : `nota ${estado.tono}`}
        >
          {estado.texto}
        </p>
      </section>
    </div>
  );
};
