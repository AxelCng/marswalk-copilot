"""
Prueba del copiloto con las preguntas de la demo y uno o más modelos.
Requiere: Ollama corriendo y el mock (o la API de Said) en API_URL.

Uso:
    python test_preguntas.py                      # usa MODELO del .env
    python test_preguntas.py qwen2.5:3b qwen2.5:7b

Cada caso revisa: la herramienta esperada, los argumentos clave y que no haya números sin fuente.
Los valores esperados salen de contracts/ejemplos/ (grafo falso). Con el graph.json real se ajustan.
"""
import json
import sys

import requests

from agent import responder
from config import API_URL, MODELO


def args_de(r, herramienta):
    return next((c["argumentos"] for c in reversed(r["llamadas"]) if c["herramienta"] == herramienta and c["ok"]), None)


def chequeo_demo1(r):
    a = args_de(r, "optimizar_mision")
    return bool(a) and set(a["estaciones"]) == {"E1", "M1", "M2", "E2"} and a["pendiente_max"] == 15 \
        and a["tiempo_max_min"] == 240


def chequeo_demo2(r):
    a = args_de(r, "optimizar_mision")
    return bool(a) and "E2" in a["estaciones"] and a["pendiente_max"] == 20 and bool(r["ruta"]) and "E2" in r["ruta"]["ruta"]


def chequeo_demo3(r):
    a = args_de(r, "recalcular_por_alerta")
    return bool(a) and a["zona"] == "Z2" and a["tipo"] == "polvo"


def chequeo_info(r):
    a = args_de(r, "info_estacion")
    return bool(a) and a["id"] == "M1"


# Conversación de la demo: cada pregunta ve el historial de la anterior
DEMO = [
    ("demo-1 mision", "Quiero visitar el frente del delta, los dos puntos de muestreo (Séítah y Three Forks) y la "
                      "cima del delta, volver en menos de 4 horas y sin pendientes de más de 15 grados.", chequeo_demo1),
    ("demo-2 cambio", "¿Y si acepto hasta 20°?", chequeo_demo2),
    ("demo-3 alerta", "Alerta de polvo en la zona Z2. Recalcula.", chequeo_demo3),
]
# Preguntas sueltas (sin historial)
SUELTAS = [
    ("info", "¿Qué tarea hay que hacer en Séítah sur y cuánto tiempo toma?", chequeo_info),
    ("ingles", "I want to go from the habitat to the delta front, max slope 15 degrees. How long?",
     lambda r: bool(args_de(r, "ruta_punto_a_punto") or args_de(r, "optimizar_mision"))),
    ("trampa", "¿Cuántos minutos dura la caminata?", None),  # no hay misión: no debe inventar números
]


def correr(modelo):
    requests.post(f"{API_URL}/reset", timeout=10)
    filas, hist = [], []
    for nombre, pregunta, chequeo in DEMO:
        filas.append(probar(modelo, nombre, pregunta, chequeo, hist))
        hist = filas[-1]["historial"]
    requests.post(f"{API_URL}/reset", timeout=10)
    for nombre, pregunta, chequeo in SUELTAS:
        filas.append(probar(modelo, nombre, pregunta, chequeo, []))
    return filas


def probar(modelo, nombre, pregunta, chequeo, hist):
    print(f"\n=== [{modelo}] {nombre}: {pregunta}")
    try:
        r = responder(pregunta, hist, modelo=modelo)
    except Exception as e:
        print("   ERROR:", repr(e))
        return {"nombre": nombre, "ok": False, "segundos": None, "sin_fuente": ["ERROR"], "historial": hist}
    for c in r["llamadas"]:
        print(f"   -> {c['herramienta']}({json.dumps(c['argumentos'], ensure_ascii=False)})" + ("" if c["ok"] else "  ERROR"))
    print("   Respuesta:", r["respuesta"].strip().replace("\n", "\n              "))
    ok = chequeo(r) if chequeo else not r["numeros_sin_fuente"]
    print(f"   Tiempo: {r['segundos']} s | chequeo: {'OK' if ok else 'FALLA'}"
          f" | números sin fuente: {r['numeros_sin_fuente'] or 'ninguno'}")
    return {"nombre": nombre, "ok": ok, "segundos": r["segundos"],
            "sin_fuente": r["numeros_sin_fuente"], "historial": r["historial"]}


if __name__ == "__main__":
    modelos = sys.argv[1:] or [MODELO]
    resumen = {m: correr(m) for m in modelos}
    print("\n\n===== RESUMEN =====")
    for m, filas in resumen.items():
        ok = sum(f["ok"] for f in filas)
        limpias = sum(not f["sin_fuente"] for f in filas)
        tiempos = [f["segundos"] for f in filas if f["segundos"] is not None]
        prom = round(sum(tiempos) / len(tiempos), 1) if tiempos else None
        print(f"{m}: chequeos {ok}/{len(filas)} | sin números inventados {limpias}/{len(filas)} | "
              f"promedio {prom} s por pregunta")
        for f in filas:
            print(f"   {f['nombre']:<14} {'OK ' if f['ok'] else 'FALLA'}  {f['segundos']} s  sin fuente: {f['sin_fuente'] or '-'}")
