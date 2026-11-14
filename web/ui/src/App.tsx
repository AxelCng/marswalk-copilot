import React, { useState, useEffect } from 'react';
import type { EstacionDetalle, RespuestaMision } from './types/mission';
import { api } from './services/api';
import { HudHeader } from './components/HudHeader';
import { ChatPanel } from './components/ChatPanel';
import { StationCard } from './components/StationCard';
import { StationModal } from './components/StationModal';
import { MissionSummary } from './components/MissionSummary';
import { PlanBForm } from './components/PlanBForm';
import { MapaMision } from './components/MapaMision';
import { MOCK_ESTACIONES, MOCK_GRAFO } from './mocks/mockData';
import type { Grafo } from '../../map/src/mapa';
import type { ChatResponse } from './types/mission';
import { MapPin, Compass, Route, Info, Wind, RadioTower, RotateCcw } from 'lucide-react';

export const App: React.FC = () => {
  const [stations, setStations] = useState<EstacionDetalle[]>(MOCK_ESTACIONES);
  const [selectedStation, setSelectedStation] = useState<EstacionDetalle | null>(null);
  const [activeMission, setActiveMission] = useState<RespuestaMision | null>(null);
  const [grafo, setGrafo] = useState<Grafo | null>(null);
  const [zonaAlerta, setZonaAlerta] = useState<string | null>(null);
  const [avisoAlerta, setAvisoAlerta] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'planb' | 'stations'>('chat');
  const [filterTipo, setFilterTipo] = useState<string>('all');

  useEffect(() => {
    // Attempt loading stations from API service
    const loadData = async () => {
      try {
        const fullStations = await Promise.all(
          MOCK_ESTACIONES.map(async (st) => {
            try {
              return await api.getEstacion(st.id);
            } catch {
              return st;
            }
          })
        );
        setStations(fullStations);
      } catch (e) {
        console.warn('Usando mock de estaciones:', e);
      }
    };
    loadData();
    api.getGrafo()
      .then(setGrafo)
      .catch((e) => { console.warn('Sin /grafo, se usa contracts/graph_fake.json:', e); setGrafo(MOCK_GRAFO); });
  }, []);

  /** Misión nueva (chat o plan B): sin alerta activa. */
  const mostrarMision = (m: RespuestaMision) => { setZonaAlerta(null); setAvisoAlerta(null); setActiveMission(m); };

  /** Respuesta del chat: si el copiloto llamó a recalcular_por_alerta, se muestra como alerta. */
  const onRutaDelChat = (ruta: RespuestaMision, res?: ChatResponse) => {
    const alerta = res?.llamadas.find((l) => l.herramienta === 'recalcular_por_alerta');
    if (alerta) { setZonaAlerta(String(alerta.argumentos.zona ?? '')); setActiveMission(ruta); }
    else mostrarMision(ruta);
  };

  const lanzarAlerta = async (zona: string, tipo: 'polvo' | 'comms') => {
    if (!activeMission) { setAvisoAlerta('Primero pide una misión (chat o Plan B).'); return; }
    try {
      const r = await api.postAlerta(zona, tipo);
      setZonaAlerta(tipo === 'polvo' ? zona : null);
      setActiveMission(r);
      const evitados = r.aristas_afectadas ?? [];
      setAvisoAlerta(`${tipo === 'polvo' ? `Polvo en ${zona}` : 'Pérdida de comunicación'}: ` +
        (evitados.length ? `evitados ${evitados.join(', ')}` : 'la ruta no cruzaba la zona') + ` · ${r.totales.tiempo_min} min`);
    } catch (e) {
      setAvisoAlerta(`No se pudo recalcular: ${e instanceof Error ? e.message : e}`);
    }
  };

  const resetear = async () => {
    try { await api.resetAlerta(); } catch (e) { console.warn(e); }
    setZonaAlerta(null); setAvisoAlerta(null); setActiveMission(null);
  };

  const handleSelectStationById = async (id: string) => {
    const found = stations.find((s) => s.id === id);
    if (found) {
      setSelectedStation(found);
    }
  };

  const filteredStations = stations.filter((s) => {
    if (filterTipo === 'all') return true;
    return s.tipo === filterTipo;
  });

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans">
      {/* Top Tactical HUD Header */}
      <HudHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stationsCount={stations.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner: Space Apps Context & Mission Area */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-orange-950/30 via-slate-900 to-cyan-950/30 p-4 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/20 px-2 py-0.5 text-xs font-mono font-bold text-orange-400 border border-orange-500/30">
                  <MapPin className="h-3 w-3" /> CRÁTER JEZERO · MARTE
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Ruta Perseverance · Octavia E. Butler Landing
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Planificador Inteligente de EVA y Geología de Superficie
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Fórmula de marcha:</span>
              <span className="bg-black/60 border border-slate-700 text-cyan-300 px-2.5 py-1 rounded-lg">
                Tobler v(θ) × factor_traje
              </span>
            </div>
          </div>
        </div>

        {/* Mapa de la misión (web/map, Añe) + alertas */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800 font-mono text-xs">
            <span className="text-slate-400 mr-1 flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-red-400" /> Alerta de polvo:</span>
            {(grafo?.zonas ?? []).map((z) => (
              <button key={z.id} onClick={() => lanzarAlerta(z.id, 'polvo')}
                className={`px-2.5 py-1 rounded-md border transition-colors ${zonaAlerta === z.id
                  ? 'bg-red-600 border-red-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-red-400'}`}>
                {z.id} {z.nombre}
              </button>
            ))}
            <button onClick={() => lanzarAlerta('Z1', 'comms')}
              className="px-2.5 py-1 rounded-md border bg-slate-900 border-slate-700 text-slate-300 hover:border-pink-400 flex items-center gap-1">
              <RadioTower className="h-3.5 w-3.5" /> Sin comunicación
            </button>
            <button onClick={resetear}
              className="px-2.5 py-1 rounded-md border bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400 flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            {avisoAlerta && <span className="ml-auto text-amber-300">{avisoAlerta}</span>}
          </div>
          <MapaMision
            className="h-[460px] w-full"
            grafo={grafo}
            mision={activeMission}
            zonaAlerta={zonaAlerta}
            onClickEstacion={handleSelectStationById}
          />
        </div>

        {/* View Switcher Content */}
        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Chat Copilot (takes 7 cols) */}
            <div className="lg:col-span-7 h-[680px]">
              <ChatPanel
                onRouteGenerated={onRutaDelChat}
                onViewRoute={() => {
                  const el = document.getElementById('mission-summary-anchor');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>

            {/* Right: Active Mission Telemetry & Station Quick Access (takes 5 cols) */}
            <div className="lg:col-span-5 space-y-5" id="mission-summary-anchor">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Route className="h-3.5 w-3.5 text-cyan-400" /> Telemetría de la Misión
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400">
                    Sincronizado con Grafo
                  </span>
                </div>
                <MissionSummary
                  mission={activeMission}
                  onSelectStation={handleSelectStationById}
                />
              </div>

              {/* Quick Stations Carousel / Strip */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-amber-400" /> Estaciones Cercanas
                  </h3>
                  <button
                    onClick={() => setActiveTab('stations')}
                    className="text-[11px] font-mono text-cyan-400 hover:underline"
                  >
                    Ver todas ({stations.length}) →
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 max-h-[310px] overflow-y-auto pr-1">
                  {stations.slice(0, 4).map((station) => (
                    <StationCard
                      key={station.id}
                      station={station}
                      onSelect={(st) => setSelectedStation(st)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'planb' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <PlanBForm
                stations={stations}
                onMissionCalculated={mostrarMision}
                onAlertaCalculada={(r, z) => { setZonaAlerta(z); setActiveMission(r); }}
              />
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                  Resultado de la Optimización
                </h3>
              </div>
              <MissionSummary
                mission={activeMission}
                onSelectStation={handleSelectStationById}
              />

              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400 space-y-2">
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                  <Info className="h-4 w-4" /> ¿Por qué existe el Modo Plan B?
                </div>
                <p className="leading-relaxed">
                  En la evaluación en vivo ante el jurado o en misiones reales con caída de enlace de satélite, este formulario garantiza que la misión se compute 100% matemáticamente mediante los algoritmos de <strong>OR-Tools / Dijkstra</strong> sin depender de la inferencia del LLM.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stations' && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-xl font-mono text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 mr-1">Filtrar por tipo:</span>
                {[
                  { id: 'all', label: 'TODAS' },
                  { id: 'ciencia', label: 'CIENCIA' },
                  { id: 'muestreo', label: 'MUESTREO' },
                  { id: 'habitat', label: 'BASE / ROVER' },
                  { id: 'refugio', label: 'REFUGIO / COMMS' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterTipo(f.id)}
                    className={`px-3 py-1 rounded-lg border transition-colors ${filterTipo === f.id
                        ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <span className="text-slate-400 text-[11px]">
                Mostrando {filteredStations.length} de {stations.length} puntos de interés
              </span>
            </div>

            {/* Stations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredStations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onSelect={(st) => setSelectedStation(st)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Station Modal for Detail Inspection */}
      <StationModal
        station={selectedStation}
        onClose={() => setSelectedStation(null)}
      />

      {/* Footer credits and NASA compliance note */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#070b12] py-4 px-6 text-center text-xs font-mono text-slate-500">
        <p>
          NASA Space Apps Challenge 2026 · MarsWalk Copilot · Datos: NASA/JPL-Caltech (Perseverance), USGS SIM 3464, MSSS/ASU.
        </p>
        <p className="text-[10px] text-slate-600 mt-1">
          Este proyecto es un prototipo desarrollado para propósitos educativos y de investigación aeroespacial. No implica aval oficial de NASA.
        </p>
      </footer>
    </div>
  );
};
export default App;
