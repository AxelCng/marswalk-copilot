import React, { useState } from 'react';
import type { MensajeHistorial } from '../types/mission';
import { Bot, User, Wrench, CheckCircle2, ChevronDown, ChevronRight, Route } from 'lucide-react';

interface ChatMessageProps {
  message: MensajeHistorial;
  onViewRoute?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onViewRoute }) => {
  const isUser = message.rol === 'usuario';
  const [showTools, setShowTools] = useState(false);

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}>
      {/* Sender Header */}
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
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-hud-cyan/20 text-hud-cyan">
              <Bot className="h-2.5 w-2.5" />
            </div>
            <span className="font-semibold text-hud-cyan">MARSWALK COPILOT</span>
            <span>{message.timestamp}</span>
          </>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[88%] rounded p-3.5 text-sm leading-relaxed  ${
          isUser
            ? 'bg-hud-glass border border-hud-border border-r-2 border-r-rust text-ink rounded-tr-none'
            : 'bg-hud-glass border border-hud-border/80 text-ink rounded-tl-none'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.contenido}</p>

        {/* Tool calling telemetry dropdown */}
        {message.llamadas && message.llamadas.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-hud-border/60 font-mono text-xs">
            <button
              onClick={() => setShowTools(!showTools)}
              className="flex items-center gap-1.5 text-[11px] text-hud-cyan/90 hover:text-hud-cyan transition-colors"
            >
              <Wrench className="h-3 w-3" />
              <span>
                {message.llamadas.length} {message.llamadas.length === 1 ? 'función ejecutada' : 'funciones ejecutadas'}
              </span>
              {showTools ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>

            {showTools && (
              <div className="mt-2 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                {message.llamadas.map((tool, idx) => (
                  <div
                    key={idx}
                    className="rounded bg-hud-deep border border-hud-border border-l-2 border-l-hud-cyan p-2 text-[10px] text-ink-dim font-mono"
                  >
                    <div className="flex items-center justify-between text-hud-cyan font-bold mb-1">
                      <span><span className="text-ink-mute">$</span> {tool.herramienta}()</span>
                      <span className="flex items-center gap-0.5 text-nominal text-[9px]">
                        <CheckCircle2 className="h-2.5 w-2.5" /> OK
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

        {/* Route button preview */}
        {message.ruta && (
          <div className="mt-2.5 pt-2 border-t border-hud-border/60 flex items-center justify-between text-xs font-mono">
            <span className="text-nominal flex items-center gap-1">
              <Route className="h-3.5 w-3.5" /> Ruta óptima: {message.ruta.ruta.join(' → ')}
            </span>
            {onViewRoute && (
              <button
                onClick={onViewRoute}
                className="px-2 py-0.5 rounded bg-hud-cyan/10 border border-hud-cyan/50 text-hud-cyan hover:bg-hud-cyan/10 transition-colors text-[10px]"
              >
                Ver Telemetría
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
