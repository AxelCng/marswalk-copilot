import React, { useState } from 'react';
import type { MensajeHistorial } from '../types/mission';
import { ChevronDown, ChevronRight, Route, SlidersHorizontal } from 'lucide-react';

interface ChatMessageProps {
  message: MensajeHistorial;
  onViewRoute?: () => void;
  onIrPlanB?: () => void;
}

const signo = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * El modelo a veces responde en Markdown ("**Route**: ..."). Sin esto se veían los asteriscos.
 * Solo se interpreta la negrita y se juntan los saltos de línea dobles; nada de HTML crudo.
 */
function conFormato(texto: string): React.ReactNode[] {
  return texto
    .replace(/\n{3,}/g, '\n\n')
    .split(/(\*\*[^*\n]+\*\*)/g)
    .map((parte, i) =>
      parte.startsWith('**') && parte.endsWith('**') && parte.length > 4
        ? <strong key={i} className="font-semibold text-ink">{parte.slice(2, -2)}</strong>
        : parte,
    );
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onViewRoute, onIrPlanB }) => {
  const isUser = message.rol === 'usuario';
  const [showTools, setShowTools] = useState(false);
  const llamadas = message.llamadas ?? [];
  const fallidas = llamadas.filter((l) => !l.ok).length;
  const comp = message.ruta?.comparison_with_previous;
  const sinFuente = message.numeros_sin_fuente ?? [];

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Remitente */}
      <div className="flex items-baseline gap-2 text-xs text-ink-mute px-0.5">
        <span className={`font-medium ${isUser ? 'text-ink-dim' : message.error ? 'text-critical' : 'text-hud-cyan'}`}>
          {isUser ? 'You' : 'Copilot'}
        </span>
        {message.timestamp && <span className="dato-num">{message.timestamp}</span>}
        {/* Cuánto tardó: el modelo local puede demorar, y es honesto mostrarlo */}
        {!isUser && message.segundos != null && <span className="dato-num">answered in {Math.round(message.segundos)} s</span>}
      </div>

      {/* Burbuja: la del usuario lleva el óxido de la marca; la del copiloto, neutra */}
      <div
        className={`max-w-[88%] rounded-md px-3.5 py-3 text-[15px] leading-6 ${
          isUser
            ? 'bg-rust/12 border border-rust/30 text-ink'
            : message.error
              ? 'bg-critical/5 border border-critical/50 text-ink'
              : 'bg-hud-glass border border-hud-border/80 text-ink'
        }`}
      >
        <p className="m-0 whitespace-pre-wrap">{isUser ? message.contenido : conFormato(message.contenido)}</p>

        {message.error && onIrPlanB && (
          <button type="button" onClick={onIrPlanB} className="btn alerta mt-3">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Open Mission Planner
          </button>
        )}

        {/* Qué cambió respecto a la misión anterior (lo calcula llm/agent.py, no el modelo) */}
        {comp && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="label-caps mr-1">Compared with the last plan</span>
            <span className={`chip sin-punto ${comp.time_difference_min > 0 ? 'warning' : 'nominal'} dato-num`}>
              {signo(comp.time_difference_min)} min
            </span>
            {comp.stations_added.map((id) => (
              <span key={`a-${id}`} className="chip sin-punto nominal">Adds {id}</span>
            ))}
            {comp.stations_removed.map((id) => (
              <span key={`q-${id}`} className="chip sin-punto critical">Drops {id}</span>
            ))}
          </div>
        )}

        {sinFuente.length > 0 && (
          <p className="nota warning mt-3">
            Double-check these numbers; the route engine didn&apos;t return them: {sinFuente.join(', ')}.
          </p>
        )}

        {/* Llamadas a herramientas: terminal mono */}
        {llamadas.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-hud-border/60 text-xs">
            {/* Prueba de que los números salen del motor: qué se le pidió, con qué argumentos */}
            <button
              type="button"
              onClick={() => setShowTools(!showTools)}
              aria-expanded={showTools}
              className="flex items-center gap-1 text-[13px] text-ink-dim hover:text-ink transition-colors"
            >
              {showTools ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>
                {showTools ? 'Hide' : 'Show'} {llamadas.length === 1 ? 'the engine call' : `${llamadas.length} engine calls`}
                {fallidas > 0 && <span className="text-critical">, {fallidas} failed</span>}
              </span>
            </button>

            {showTools && (
              <div className="mt-2 space-y-1.5">
                {llamadas.map((tool, idx) => (
                  <div
                    key={idx}
                    className={`rounded bg-hud-deep border border-hud-border border-l-2 ${tool.ok ? 'border-l-hud-cyan' : 'border-l-critical'} p-2 text-[10px] text-ink-dim font-mono`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span className="text-hud-cyan">{tool.tool}</span>
                      <span className={`chip sin-punto !min-h-[18px] ${tool.ok ? 'nominal' : 'critical'}`}>
                        {tool.ok ? 'Returned' : 'Failed'}
                      </span>
                    </div>
                    <pre className="m-0 text-ink-dim overflow-x-auto p-1 text-[10px] leading-[14px]">
                      {JSON.stringify(tool.arguments, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ruta resultante */}
        {message.ruta && !message.error && (
          <div className="mt-2.5 pt-2 border-t border-hud-border/60 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className={`${message.ruta.factible ? 'text-ink-dim' : 'text-critical'} flex items-center gap-1.5`}>
              <Route className={`h-4 w-4 shrink-0 ${message.ruta.factible ? 'text-hud-cyan' : ''}`} />
              {message.ruta.factible ? <span className="font-medium">{message.ruta.ruta.join(' → ')}</span> : 'No route meets these limits'}
            </span>
            {onViewRoute && (
              <button
                type="button"
                onClick={onViewRoute}
                className="text-hud-cyan hover:underline"
              >
                See the plan
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
