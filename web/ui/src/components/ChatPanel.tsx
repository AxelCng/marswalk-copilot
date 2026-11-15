import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { copiloto, useCopiloto } from '../services/copiloto';
import { Send, Loader2, RotateCcw, Mic, Square } from 'lucide-react';
import { DEMO, FRASES } from '../demo';

// Web Speech is not yet included in TypeScript's standard DOM definitions.
type SpeechResultEvent = Event & { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } };
type SpeechErrorEvent = Event & { error: string };
interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => BrowserRecognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

interface ChatPanelProps {
  onViewRoute?: () => void;
  /** Lleva al formulario Plan B cuando el copiloto no responde. */
  onIrPlanB?: () => void;
}

// Las 3 preguntas del guion de la demo, en orden (es una secuencia real: cada una depende de la anterior).
const DEMO_PRESETS = [
  { label: `Walk at ${DEMO.pendiente_1}°, under 4 h`, text: FRASES.paso1 },
  { label: `Allow ${DEMO.pendiente_2}°`, text: FRASES.paso2 },
  { label: `Dust in ${DEMO.zona}`, text: FRASES.paso3 },
];

export const ChatPanel: React.FC<ChatPanelProps> = ({ onViewRoute, onIrPlanB }) => {
  // La conversación es compartida con el visor del astronauta (services/copiloto.ts)
  const { mensajes: messages, cargando: loading, desde } = useCopiloto();
  const [input, setInput] = useState('');
  const [espera, setEspera] = useState(0);
  const [listening, setListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('');
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const Recognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
  const listaRef = useRef<HTMLDivElement>(null);

  // Baja al último mensaje desplazando solo la lista del chat. scrollIntoView movía la página entera,
  // así que al cargar (sobre todo en el celular) la pantalla saltaba sola hasta el chat.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Contador de espera: el modelo local tarda decenas de segundos en CPU.
  // Cuenta desde que empezó la pregunta, aunque se haya hecho en otra ventana.
  useEffect(() => {
    if (!loading || desde == null) return;
    const contar = () => setEspera(Math.floor((Date.now() - desde) / 1000));
    contar();
    const id = setInterval(contar, 1000);
    return () => clearInterval(id);
  }, [loading, desde]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
  }, []);

  const toggleDictation = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (!Recognition) return;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const phrases: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) phrases.push(event.results[i][0].transcript.trim());
      }
      const spoken = phrases.filter(Boolean).join(' ');
      if (spoken) {
        setInput((current) => current.trim() ? `${current.trimEnd()} ${spoken}` : spoken);
        setSpeechStatus('Dictation added. Review the message before sending.');
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone permission denied. Allow it in browser settings to use voice input.',
        'service-not-allowed': 'Speech recognition is blocked in this browser.',
        'audio-capture': 'No microphone found. Check your microphone and try again.',
        'no-speech': 'No speech detected. Try again.',
        'network': 'Speech recognition needs a network connection. You can type instead.',
      };
      setSpeechStatus(messages[event.error] ?? `Voice input failed (${event.error}). You can type instead.`);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setListening(false);
      setSpeechStatus((status) => status.startsWith('Listening') ? 'Voice input stopped. You can type or try again.' : status);
    };
    try {
      recognition.start();
      setListening(true);
      setSpeechStatus('Listening… Speak now, then review the text.');
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setSpeechStatus('Could not start voice input. Check your browser and microphone.');
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      setListening(false);
    }
    setSpeechStatus('');

    if (!textToSend) setInput('');
    await copiloto.preguntar(text);
  };

  const handleClear = () => copiloto.reiniciar();

  return (
    <div className="panel flex flex-col h-full overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-hud-border/80 px-4 py-3">
        <div>
          <h3 className="m-0 font-display text-base font-semibold text-ink">Copilot</h3>
          <p className="m-0 text-xs text-ink-mute">Asks the route engine, then explains the plan</p>
        </div>

        <button
          onClick={handleClear}
          disabled={loading}
          title="Start a new conversation"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-ink-dim hover:bg-hud-glass hover:text-ink transition-colors disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {/* Guion de la demo: las 3 preguntas en orden */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hud-subtle overflow-x-auto text-[13px]">
        <span className="text-ink-mute flex-shrink-0 mr-1">Try</span>
        {DEMO_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handleSend(preset.text)}
            disabled={loading}
            title={preset.text}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-hud-border text-ink hover:border-hud-cyan transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="dato-num text-hud-cyan">{i + 1}</span> {preset.label}
          </button>
        ))}
      </div>

      {/* Mensajes */}
      <div ref={listaRef} className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onViewRoute={onViewRoute} onIrPlanB={onIrPlanB} />
        ))}

        {loading && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-dim border border-hud-border rounded px-3 py-2 w-fit" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-hud-cyan" />
            <span>Planning the route</span>
            <span className="dato-num text-ink-mute">{espera} s</span>
            {espera >= 20 && onIrPlanB && (
              <button type="button" onClick={onIrPlanB} className="ml-1 underline text-ink-dim hover:text-hud-cyan">
                Taking long? Use Mission Planner
              </button>
            )}
          </div>
        )}
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
            placeholder="Ask for a walk, or change the last one"
            disabled={loading}
            aria-label="Message to the copilot"
            className="flex-1 min-w-0 bg-hud-deep/90 border border-hud-border rounded px-3.5 py-2.5 text-[15px] text-ink placeholder-ink-mute focus:outline-none focus:border-hud-cyan transition-colors"
          />

          {/* Dictado por voz (Said, PR #10) */}
          <button type="button" onClick={toggleDictation} disabled={loading || !Recognition}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'} aria-pressed={listening}
            title={Recognition ? (listening ? 'Stop voice input' : 'Dictate a message') : 'Voice input is not supported by this browser'}
            className={`flex items-center justify-center h-10 w-10 shrink-0 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${listening ? 'bg-critical border-critical text-ink' : 'bg-hud-deep border-hud-border text-ink-dim hover:text-ink hover:border-ink-mute'}`}>
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded bg-hud-cyan text-hud-deep hover:bg-[#5cefff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className={`mt-1.5 mb-0 text-[11px] leading-4 ${listening ? 'text-hud-cyan' : 'text-ink-mute'}`} role="status" aria-live="polite">
          {speechStatus || (Recognition ? 'Voice transcription may use an online browser service. Review text before sending.' : 'Voice input is unavailable in this browser; type your message.')}
        </p>
      </div>
    </div>
  );
};
