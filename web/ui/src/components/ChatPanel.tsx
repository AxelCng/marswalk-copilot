import React, { useState, useRef, useEffect } from 'react';
import type { ChatResponse, MensajeHistorial, RespuestaMision } from '../types/mission';
import { ChatMessage } from './ChatMessage';
import { api } from '../services/api';
import { Send, Sparkles, Loader2, RefreshCw, Radio } from 'lucide-react';
import { DEMO, FRASES } from '../demo';

interface ChatPanelProps {
  onRouteGenerated?: (ruta: RespuestaMision, respuesta?: ChatResponse) => void;
  onViewRoute?: () => void;
  /** Lleva al formulario Plan B cuando el copiloto no responde. */
  onIrPlanB?: () => void;
}

const DEMO_PRESETS = [
  { label: `Paso 1: Misión ${DEMO.pendiente_1}° (<4h)`, text: FRASES.paso1 },
  { label: `Paso 2: ¿Y si acepto ${DEMO.pendiente_2}°?`, text: FRASES.paso2 },
  { label: `Paso 3: Alerta Polvo ${DEMO.zona}`, text: FRASES.paso3 },
];

const hora = () => `SOL 415 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

const saludo = (contenido: string): MensajeHistorial => ({
  id: `init-${Date.now()}`,
  rol: 'asistente',
  contenido,
  timestamp: 'SOL 415',
  local: true,
});

export const ChatPanel: React.FC<ChatPanelProps> = ({ onRouteGenerated, onViewRoute, onIrPlanB }) => {
  const [messages, setMessages] = useState<MensajeHistorial[]>([
    saludo("Copiloto EVA MarsWalk en línea. Indícame los objetivos científicos de la caminata en Jezero Crater, el tiempo límite de soporte vital y la pendiente máxima tolerable por el traje.")
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [espera, setEspera] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Contador de espera: el modelo local tarda decenas de segundos en CPU.
  useEffect(() => {
    if (!loading) return;
    setEspera(0);
    const t0 = Date.now();
    const id = setInterval(() => setEspera(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: MensajeHistorial = {
      id: `user-${Date.now()}`,
      rol: 'usuario',
      contenido: text,
      timestamp: hora()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      // Solo la conversación real: un historial vacío hace que /chat empiece de cero.
      const historyPayload = messages
        .filter((m) => !m.local)
        .map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.contenido }));

      const res = await api.postChat(text, historyPayload);

      const botMsg: MensajeHistorial = {
        id: `bot-${Date.now()}`,
        rol: 'asistente',
        contenido: res.answer,
        timestamp: hora(),
        llamadas: res.calls,
        ruta: res.route,
        segundos: res.seconds,
        numeros_sin_fuente: res.unsourced_numbers,
        // Con error, /chat igual responde 200: el mensaje no entra al historial y se ofrece el Plan B.
        error: Boolean(res.error),
        local: Boolean(res.error),
      };

      setMessages((prev) => [...prev, botMsg]);

      if (res.route && !res.error) {
        onRouteGenerated?.(res.route, res);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        rol: 'asistente',
        contenido: "Sin enlace con el copiloto. Calcula la misión directo con el motor de grafos desde el formulario Plan B.",
        timestamp: hora(),
        error: true,
        local: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([saludo("Historial reiniciado. Lista para planificar una nueva EVA en Jezero Crater.")]);
  };

  return (
    <div className="panel flex flex-col h-full overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-hud-border/80 px-4 py-3 bg-hud-panel/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio className="h-4 w-4 text-hud-cyan animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-hud-cyan animate-ping" />
          </div>
          <div>
            <h3 className="m-0 font-display text-sm font-semibold text-ink">
              Canal EVA / Copiloto de Caminata
            </h3>
            <span className="label-caps">
              Tool calling · FastAPI
            </span>
          </div>
        </div>

        <button
          onClick={handleClear}
          disabled={loading}
          title="Reiniciar conversación"
          className="p-1.5 rounded text-ink-dim hover:bg-hud-glass hover:text-ink transition-colors disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Guion de la demo */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-hud-deep/60 border-b border-hud-subtle overflow-x-auto text-[11px] font-mono">
        <span className="label-caps flex-shrink-0 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-hud-cyan" /> Guion demo
        </span>
        {DEMO_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handleSend(preset.text)}
            disabled={loading}
            title={preset.text}
            className="flex-shrink-0 px-2.5 py-1 rounded bg-hud-glass/80 border border-hud-border hover:border-hud-cyan text-hud-cyan transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onViewRoute={onViewRoute} onIrPlanB={onIrPlanB} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs font-mono text-hud-cyan bg-hud-cyan/5 border border-hud-cyan/40 rounded p-3 w-fit">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Copiloto calculando con el motor de grafos…</span>
            <span className="dato-num text-ink-dim">{espera} s</span>
            {espera >= 20 && onIrPlanB && (
              <button type="button" onClick={onIrPlanB} className="ml-1 underline text-ink-dim hover:text-hud-cyan">
                usar Plan B
              </button>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Entrada */}
      <div className="p-3 bg-hud-panel border-t border-hud-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ej: Quiero visitar E1 y M1 con máx ${DEMO.pendiente_2}° de pendiente...`}
            disabled={loading}
            aria-label="Mensaje al copiloto"
            className="flex-1 min-w-0 bg-hud-deep/90 border border-hud-border rounded px-4 py-2.5 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-hud-cyan focus:shadow-glow-focus transition-all font-mono"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded bg-hud-cyan text-hud-deep hover:shadow-glow-cyan disabled:opacity-40 disabled:cursor-not-allowed transition-shadow"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
