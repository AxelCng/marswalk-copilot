"""
Bucle del copiloto: el modelo elige herramientas, nosotros las ejecutamos y le devolvemos el resultado,
hasta que responde en texto. Cada número de la respuesta debe venir de una herramienta.
"""
import json
import re
import time

from ollama import Client

from config import MAX_PASOS, MODELO, OLLAMA_URL
from tools import TOOLS, ejecutar

SYSTEM = """Eres MarsWalk Copilot, el asistente de planificación de caminatas (EVA) en el cráter Jezero, Marte.
Hablas con el tripulante que está en el hábitat y apoya al astronauta en la superficie.

Reglas:
1. Nunca calcules rutas, distancias ni tiempos tú mismo. Siempre llama a una herramienta y usa SOLO los números que devuelve.
2. Si el usuario nombra estaciones por su nombre, llama primero a listar_estaciones para obtener los ids.
3. Para varias estaciones o un tiempo límite usa optimizar_mision. Convierte horas a minutos (3 horas = 180).
4. Para alertas de polvo o pérdida de comunicación usa recalcular_por_alerta.
5. Si una estación fue omitida, explica el motivo con los datos de "omitidas" (pendiente, tiempo o alerta).
6. Si falta un dato que no puedes obtener con herramientas, pregunta. No inventes.
7. Responde en el idioma del usuario, breve y claro: orden de la ruta con nombres, tiempo total, margen y omisiones."""

_client = Client(host=OLLAMA_URL)
_CAMPOS_TRAMO = ("origen", "destino", "distancia_m", "tiempo_min", "pendiente_max_deg", "cobertura_com_pct")


def _compactar(res):
    """Quita geometría y campos que el modelo no necesita (menos tokens = más rápido en CPU)."""
    if not isinstance(res, dict):
        return res
    out = dict(res)
    if "tramos" in out:
        out["tramos"] = [{k: t.get(k) for k in _CAMPOS_TRAMO} for t in out["tramos"]]
    if "estaciones" in out and isinstance(out["estaciones"], list):
        out["estaciones"] = [{k: e.get(k) for k in ("id", "nombre", "tipo", "valor_cientifico")} for e in out["estaciones"]]
    out.pop("fotos", None)
    out.pop("capas", None)
    return out


def _numeros_permitidos(textos):
    nums = set()
    for t in textos:
        for n in re.findall(r"\d+(?:[.,]\d+)?", t):
            v = float(n.replace(",", "."))
            nums.add(v)
            if v >= 60:  # permite expresar minutos como horas
                nums.update({float(int(v) // 60), float(int(v) % 60), round(v / 60, 1)})
    return nums


def numeros_sin_fuente(respuesta, fuentes):
    """Números de la respuesta que no aparecen en ninguna fuente (herramientas o mensaje del usuario)."""
    permitidos = _numeros_permitidos(fuentes)
    limpio = re.sub(r"\b[A-Z]{1,3}\d+\b", " ", respuesta)          # ids como E1, Z2
    limpio = re.sub(r"(?m)^\s*\d+[.)]\s", " ", limpio)             # viñetas numeradas
    sospechosos = []
    for n in re.findall(r"\d+(?:[.,]\d+)?", limpio):
        if float(n.replace(",", ".")) not in permitidos:
            sospechosos.append(n)
    return sospechosos


def responder(mensaje, historial=None, modelo=None):
    """
    Devuelve {respuesta, llamadas, ruta, historial, segundos, numeros_sin_fuente}.
    historial: lista de {"role": "user"|"assistant", "content": str} de turnos anteriores.
    """
    modelo = modelo or MODELO
    historial = list(historial or [])
    mensajes = [{"role": "system", "content": SYSTEM}] + historial + [{"role": "user", "content": mensaje}]
    llamadas, ruta, fuentes = [], None, [mensaje] + [h["content"] for h in historial]
    t0 = time.time()
    texto = None

    for _ in range(MAX_PASOS):
        try:
            r = _client.chat(model=modelo, messages=mensajes, tools=TOOLS,
                             options={"temperature": 0, "num_ctx": 8192})
        except Exception as e:  # Ollama apagado, modelo no descargado, etc.
            return {"respuesta": f"El copiloto no está disponible ({type(e).__name__}). Usa el formulario.",
                    "llamadas": llamadas, "ruta": ruta, "historial": historial, "error": str(e),
                    "segundos": round(time.time() - t0, 1), "numeros_sin_fuente": []}
        msg = r.message
        if not msg.tool_calls:
            texto = msg.content or ""
            break
        mensajes.append(msg)
        for tc in msg.tool_calls:
            nombre, args = tc.function.name, dict(tc.function.arguments or {})
            res = ejecutar(nombre, args)
            llamadas.append({"herramienta": nombre, "argumentos": args, "resultado": res})
            if isinstance(res, dict) and "ruta" in res and "tramos" in res:
                ruta = res
            contenido = json.dumps(_compactar(res), ensure_ascii=False)
            fuentes.append(contenido)
            mensajes.append({"role": "tool", "content": contenido, "tool_name": nombre})

    if texto is None:
        texto = "No pude completar el cálculo. Prueba reformulando la petición o usa el formulario."

    historial += [{"role": "user", "content": mensaje}, {"role": "assistant", "content": texto}]
    return {
        "respuesta": texto,
        "llamadas": llamadas,
        "ruta": ruta,
        "historial": historial,
        "segundos": round(time.time() - t0, 1),
        "numeros_sin_fuente": numeros_sin_fuente(texto, fuentes),
    }
