/**
 * Panel del copiloto en el visor: la última pregunta y la última respuesta, y el estado
 * (escuchando, pensando o el error). La conversación es la misma que la del chat de la consola.
 */
import React, { useEffect, useRef, useState } from 'react';
import { copiloto, useCopiloto } from '../services/copiloto';
import type { VozCopiloto } from '../hooks/useVozCopiloto';

export const CopilotVisor: React.FC<{ voz: VozCopiloto }> = ({ voz }) => {
  const { mensajes, cargando, desde } = useCopiloto();
  const [espera, setEspera] = useState(0);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cargando || desde == null) return undefined;
    const contar = () => setEspera(Math.floor((Date.now() - desde) / 1000));
    contar();
    const id = setInterval(contar, 1000);
    return () => clearInterval(id);
  }, [cargando, desde]);

  useEffect(() => { if (voz.escribiendo) campo.current?.focus(); }, [voz.escribiendo]);

  const pregunta = [...mensajes].reverse().find((m) => m.rol === 'usuario');
  const respuesta = pregunta && mensajes.indexOf(pregunta) < mensajes.length - 1 ? mensajes[mensajes.length - 1] : null;

  useEffect(() => { cuerpo.current?.scrollTo({ top: 0 }); }, [respuesta?.id]);

  const estado = voz.aviso || (cargando ? `Thinking… ${espera} s` : '');
  if (!pregunta && !estado && !voz.escribiendo) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || cargando) return;
    void copiloto.preguntar(texto);
    setTexto('');
  };

  return (
    <section className="eva-copiloto" aria-label="Copilot" aria-live="polite">
      <header className="eva-copiloto-cab">
        <span className="label-caps">Copilot</span>
        {estado && <span className={`eva-copiloto-estado${voz.escuchando ? ' escuchando' : ''}`}>{estado}</span>}
      </header>
      <div ref={cuerpo} className="eva-copiloto-cuerpo">
        {pregunta && <p className="eva-copiloto-tu"><b>You:</b> {pregunta.contenido}</p>}
        {respuesta && (
          <p className={`eva-copiloto-resp${respuesta.error ? ' error' : ''}`}><b>Copilot:</b> {respuesta.contenido}</p>
        )}
      </div>
      {voz.escribiendo && (
        <form className="eva-copiloto-form" onSubmit={enviar}>
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); voz.cerrarTexto(); } }}
            placeholder="Ask the copilot…"
            aria-label="Ask the copilot"
            disabled={cargando}
          />
        </form>
      )}
    </section>
  );
};
