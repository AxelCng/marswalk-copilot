import React, { useState } from 'react';
import { MessageSquare, SlidersHorizontal, MapPin, ScanEye } from 'lucide-react';
import { api } from '../services/api';

type Tab = 'chat' | 'planb' | 'stations';

interface HudHeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  stationsCount: number;
  /** Abre el modo visor en primera persona (HUD de casco). */
  onAbrirVisor?: () => void;
}

export const HudHeader: React.FC<HudHeaderProps> = ({ activeTab, onTabChange, stationsCount, onAbrirVisor }) => {
  const [useMock, setUseMock] = useState(api.useMock);

  const handleToggleMock = () => {
    const next = !useMock;
    setUseMock(next);
    api.setUseMock(next);
  };

  // "Plan B" es el nombre interno del equipo; en pantalla se llama por lo que hace.
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    // Íconos ocultos en el celular: sin ellos las tres pestañas entran en 390 px
    { id: 'chat', label: 'Copilot', icon: <MessageSquare className="hidden sm:block h-4 w-4" /> },
    { id: 'planb', label: 'Mission form', icon: <SlidersHorizontal className="hidden sm:block h-4 w-4" /> },
    { id: 'stations', label: `Stations ${stationsCount}`, icon: <MapPin className="hidden sm:block h-4 w-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-hud-border bg-hud-panel/95 backdrop-blur-md px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 min-h-9">
        {/* Marca: el disco óxido es Marte; el anillo cian, la ruta que se traza sobre él */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-6 w-6 shrink-0 rounded-full bg-rust"
            style={{ boxShadow: 'inset -5px -4px 0 rgba(0,0,0,0.28), 0 0 0 2px var(--hud-panel), 0 0 0 3px var(--hud-cyan)' }}
          />
          <div className="leading-tight">
            <h1 className="m-0 font-display font-semibold text-[17px] text-ink">MarsWalk Copilot</h1>
            <p className="m-0 text-xs text-ink-mute">EVA planning for Jezero Crater</p>
          </div>
        </div>

        {/* Vistas de la consola + modo visor */}
        <div className="flex w-full sm:w-auto items-center gap-2 order-last sm:order-none">
          <nav className="segmentado flex-1 sm:min-w-[360px] bg-hud-deep" aria-label="Views">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={`inline-flex items-center justify-center gap-1.5 !min-h-[32px] ${activeTab === t.id ? 'activo' : ''}`}
                aria-pressed={activeTab === t.id}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
          {onAbrirVisor && (
            <button type="button" onClick={onAbrirVisor} className="btn !min-h-[32px] !px-3" title="Walk the route in first person">
              <ScanEye className="h-4 w-4" /> Visor
            </button>
          )}
        </div>

        {/* Fuente de datos: motor real o datos de ejemplo de contracts/ */}
        <button
          type="button"
          onClick={handleToggleMock}
          title={useMock ? 'Showing sample data. Click to use the live route engine.' : 'Using the live route engine. Click to switch to sample data.'}
          className={`chip cursor-pointer bg-hud-deep !min-h-[28px] !px-2.5 ${useMock ? 'warning' : 'nominal'}`}
        >
          {useMock ? 'Sample data' : 'Live engine'}
        </button>
      </div>
    </header>
  );
};
