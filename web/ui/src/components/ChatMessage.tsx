import React, { useState } from 'react';
import type { MensajeHistorial } from '../types/mission';
import { Bot, User, Wrench, ChevronDown, ChevronRight, Route, ShieldCheck } from 'lucide-react';

interface ChatMessageProps {
  message: MensajeHistorial;
  onViewRoute?: () => void;
  onIrPlanB?: () => void;
}

const signo = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onViewRoute, onIrPlanB }) => {
  const isUser = message.rol === 'usuario';
  const [showTools, setShowTools] = useState(false);
  const llamadas = message.llamadas ?? [];
  const fallidas = llamadas.filter((l) => !l.ok).length;
  const comp = message.ruta?.comparacion_con_anterior;
  const sinFuente = message.numeros_sin_fuente ?? [];

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Remitente */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-dim px-1">
        {isUser ? (
          <>
            <span>{message.timestamp}</span>
            <span className="font-semibold text-rust">ASTRONAUTA</span>
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-rust/20 text-rust">
              <User className="h-2.5 w-2.5" />
            </div>
          </>
        ) : (
          <>
            <div className={`flex h-4 w-4 items-center justify-center rounded-full ${message.error ? 'bg-critical/20 text-critical' : 'bg-hud-cyan/20 text-hud-cyan'}`}>
              <Bot className="h-2.5 w-2.5" />
            </div>
            <span className={`font-semibold ${message.error ? 'text-critical' : 'text-hud-cyan'}`}>MARSWALK COPILOT</span>
            <span>{message.timestamp}</span>
            {message.segundos != null && <span className="dato-num text-ink-mute">· {message.segundos} s</span>}
          </>
        )}
      </div>

      {/* Burbuja */}
      <div
        className={`max-w-[88%] rounded p-3.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-hud-glass border border-hud-border border-r-2 border-r-rust text-ink rounded-tr-none'
            : message.error
              ? 'bg-critical/5 border border-critical/50 border-l-2 border-l-critical text-ink rounded-tl-none'
              : 'bg-hud-glass border border-hud-border/80 text-ink rounded-tl-none'
        }`}
      >
        <p className="m-0 whitespace-pre-wrap">{message.contenido}</p>

        {message.error && onIrPlanB && (
          <button type="button" onClick={onIrPlanB} className="btn alerta mt-3">
            <ShieldCheck className="h-3.5 w-3.5" /> Abrir Plan B
          </button>
        )}

        {/* Qué cambió respecto a la misión anterior (lo calcula llm/agent.py, no el modelo) */}
        {comp && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="label-caps mr-1">Vs. misión anterior</span>
            <span className={`chip ${comp.diferencia_tiempo_min > 0 ? 'warning' : 'nominal'} dato-num`}>
              {signo(comp.diferencia_tiempo_min)} min
            </span>
            {comp.estaciones_agregadas.map((id) => (
              <span key={`a-${id}`} className="chip nominal">+ {id}</span>
            ))}
            {comp.estaciones_quitadas.map((id) => (
              <span key={`q-${id}`} className="chip critical">− {id}</span>
            ))}
          </div>
        )}

        {sinFuente.length > 0 && (
          <p className="nota warning mt-3">
            Revisar: números sin herramienta que los respalde ({sinFuente.join(', ')}).
          </p>
        )}

        {/* Llamadas a herramientas: terminal mono */}
        {llamadas.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-hud-border/60 font-mono text-xs">
            <button
              type="button"
              onClick={() => setShowTools(!showTools)}
              aria-expanded={showTools}
              className="flex items-center gap-1.5 text-[11px] text-hud-cyan/90 hover:text-hud-cyan transition-colors"
            >
              <Wrench className="h-3 w-3" />
              <span>
                {llamadas.length} {llamadas.length === 1 ? 'función ejecutada' : 'funciones ejecutadas'}
                {fallidas > 0 && <span className="text-critical"> · {fallidas} con error</span>}
              </span>
              {showTools ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>

            {showTools && (
              <div className="mt-2 space-y-1.5">
                {llamadas.map((tool, idx) => (
                  <div
                    key={idx}
                    className={`rounded bg-hud-deep border border-hud-border border-l-2 ${tool.ok ? 'border-l-hud-cyan' : 'border-l-critical'} p-2 text-[10px] text-ink-dim font-mono`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span className="text-hud-cyan"><span className="text-ink-mute">$</span> {tool.herramienta}()</span>
                      <span className={`chip sin-punto !min-h-[18px] ${tool.ok ? 'nominal' : 'critical'}`}>
                        {tool.ok ? 'OK' : 'Error'}
                      </span>
                    </div>
                    <pre className="m-0 text-ink-dim overflow-x-auto p-1 text-[10px] leading-[14px]">
                      {JSON.stringify(tool.argumentos, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ruta resultante */}
        {message.ruta && !message.error && (
          <div className="mt-2.5 pt-2 border-t border-hud-border/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className={`${message.ruta.factible ? 'text-nominal' : 'text-critical'} flex items-center gap-1`}>
              <Route className="h-3.5 w-3.5 shrink-0" />
              {message.ruta.factible ? message.ruta.ruta.join(' → ') : 'Sin ruta factible'}
            </span>
            {onViewRoute && (
              <button
                type="button"
                onClick={onViewRoute}
                className="px-2 py-0.5 rounded bg-hud-cyan/10 border border-hud-cyan/50 text-hud-cyan hover:border-hud-cyan transition-colors text-[10px]"
              >
                Ver telemetría
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
