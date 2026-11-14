"""
Prueba del copiloto con varias preguntas y uno o más modelos.
Requiere: Ollama corriendo y el mock (o la API de Said) en API_URL.

Uso:
    python test_preguntas.py                      # usa MODELO del .env
    python test_preguntas.py qwen2.5:3b qwen2.5:7b
"""
import json
import sys

import requests

from agent import responder
from config import API_URL, MODELO

# Conversación de la demo: cada pregunta ve el historial de la anterior
DEMO = [
    ("demo-1 mision", "Quiero visitar el frente del delta y el punto de muestreo sur, volver en menos de 3 horas "
                      "y sin pendientes de más de 15 grados.", "optimizar_mision"),
    ("demo-2 cambio", "¿Y si acepto pendientes de hasta 20 grados y agrego el afloramiento norte?", "optimizar_mision"),
    ("demo-3 alerta", "Alerta de polvo en la zona Z2. Recalcula.", "recalcular_por_alerta"),
]
# Preguntas sueltas (sin historial)
SUELTAS = [
    ("cadena", "¿Qué tarea hay que hacer en el afloramiento norte y cuánto tiempo toma?", "info_estacion"),
    ("trampa", "¿Cuántos minutos dura la caminata?", None),  # no hay misión: no debe inventar números
]


def correr(modelo):
    requests.post(f"{API_URL}/reset", timeout=10)
    filas, hist = [], []
    for nombre, pregunta, esperada in DEMO:
        filas.append(probar(modelo, nombre, pregunta, esperada, hist))
        hist = filas[-1]["historial"]
    requests.post(f"{API_URL}/reset", timeout=10)
    for nombre, pregunta, esperada in SUELTAS:
        filas.append(probar(modelo, nombre, pregunta, esperada, []))
    return filas


def probar(modelo, nombre, pregunta, esperada, hist):
    print(f"\n=== [{modelo}] {nombre}: {pregunta}")
    try:
        r = responder(pregunta, hist, modelo=modelo)
    except Exception as e:
        print("   ERROR:", e)
        return {"nombre": nombre, "ok_herramienta": False, "segundos": None, "sin_fuente": ["ERROR"],
                "historial": hist}
    usadas = [c["herramienta"] for c in r["llamadas"]]
    for c in r["llamadas"]:
        err = c["resultado"].get("error") if isinstance(c["resultado"], dict) else None
        print(f"   -> {c['herramienta']}({json.dumps(c['argumentos'], ensure_ascii=False)})" + (f"  ERROR: {err}" if err else ""))
    print("   Respuesta:", r["respuesta"].strip().replace("\n", "\n              "))
    ok = (esperada in usadas) if esperada else not r["numeros_sin_fuente"]
    print(f"   Tiempo: {r['segundos']} s | herramienta esperada: {esperada or '(ninguna obligatoria)'} -> {'OK' if ok else 'FALLA'}"
          f" | números sin fuente: {r['numeros_sin_fuente'] or 'ninguno'}")
    return {"nombre": nombre, "ok_herramienta": ok, "segundos": r["segundos"],
            "sin_fuente": r["numeros_sin_fuente"], "historial": r["historial"]}


if __name__ == "__main__":
    modelos = sys.argv[1:] or [MODELO]
    resumen = {}
    for m in modelos:
        resumen[m] = correr(m)
    print("\n\n===== RESUMEN =====")
    for m, filas in resumen.items():
        ok = sum(f["ok_herramienta"] for f in filas)
        limpias = sum(not f["sin_fuente"] for f in filas)
        tiempos = [f["segundos"] for f in filas if f["segundos"] is not None]
        prom = round(sum(tiempos) / len(tiempos), 1) if tiempos else None
        print(f"{m}: herramienta correcta {ok}/{len(filas)} | sin números inventados {limpias}/{len(filas)} | "
              f"promedio {prom} s por pregunta")
        for f in filas:
            print(f"   {f['nombre']:<14} {'OK ' if f['ok_herramienta'] else 'FALLA'}  {f['segundos']} s  sin fuente: {f['sin_fuente'] or '-'}")
