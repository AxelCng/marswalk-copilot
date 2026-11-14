"""
Prueba del copiloto con las preguntas de la demo y uno o más modelos.
Requiere: Ollama corriendo y el mock (o la API de Said) en API_URL.

Uso:
    python test_preguntas.py                      # usa MODELO del .env
    python test_preguntas.py qwen2.5:3b qwen2.5:7b

Cada caso revisa: la herramienta esperada, los argumentos clave y que no haya números sin fuente.
Demo con el graph.json real (data/out/): a 8° la cima del delta (E2) queda fuera por pendiente y a 12° entra
(ver data/HALLAZGO_pendiente_demo.md). Con 3 horas E2 no entra por tiempo: la demo usa 4 horas.
"""
import json
import re
import sys

import requests

from agent import responder
from config import API_URL, MODELO


def args_de(r, herramienta):
    return next((c["argumentos"] for c in reversed(r["llamadas"]) if c["herramienta"] == herramienta and c["ok"]), None)


PENDIENTE_DEMO_1 = 8   # E2 omitida por pendiente
PENDIENTE_DEMO_2 = 12  # E2 entra


def chequeo_demo1(r):
    a = args_de(r, "optimizar_mision")
    return bool(a) and set(a["estaciones"]) == {"E1", "M1", "M2", "E2"} and a["pendiente_max"] == PENDIENTE_DEMO_1 \
        and a["tiempo_max_min"] == 240 and bool(r["ruta"]) \
        and any(o["id"] == "E2" and o["motivo"] == "pendiente" for o in r["ruta"]["omitidas"])


def chequeo_demo2(r):
    a = args_de(r, "optimizar_mision")
    return bool(a) and "E2" in a["estaciones"] and a["pendiente_max"] == PENDIENTE_DEMO_2 \
        and bool(r["ruta"]) and "E2" in r["ruta"]["ruta"]


def chequeo_demo3(r):
    a = args_de(r, "recalcular_por_alerta")
    return bool(a) and a["zona"] == "Z2" and a["tipo"] == "polvo"


def chequeo_info(r):
    a = args_de(r, "info_estacion")
    return bool(a) and a["id"] == "M1"


def chequeo_comms(r):
    a = args_de(r, "recalcular_por_alerta")
    return bool(a) and a["tipo"] == "comms"


def chequeo_tres_horas(r):
    # Con 3 horas la cima del delta no entra por tiempo (data/HALLAZGO_pendiente_demo.md): debe decir el motivo
    a = args_de(r, "optimizar_mision")
    return bool(a) and set(a["estaciones"]) == {"E1", "E2"} and a["tiempo_max_min"] == 180 \
        and a["pendiente_max"] == 12 and bool(r["ruta"])


def chequeo_ingles_ruta(r):
    a = args_de(r, "ruta_punto_a_punto")
    return bool(a) and a["origen"] == "HAB" and a["destino"] == "M1" and a["pendiente_max"] == 8


def chequeo_no_existe(r):
    # Basta con que diga que no existe (con o sin llamar a la herramienta) y que no invente datos de E9
    pide_e9 = any("E9" in json.dumps(c["argumentos"]) for c in r["llamadas"])
    dice_que_no = re.search(r"no (existe|conozco|est[aá])|not (exist|found|in the catalog)", r["respuesta"], re.I)
    return (pide_e9 or bool(dice_que_no)) and not r["numeros_sin_fuente"]


# Conversación de la demo: cada pregunta ve el historial de la anterior
DEMO = [
    ("demo-1 mision", "Quiero visitar el frente del delta, los dos puntos de muestreo (Séítah y Three Forks) y la "
                      "cima del delta, volver en menos de 4 horas y sin pendientes de más de 8 grados.", chequeo_demo1),
    ("demo-2 cambio", "¿Y si acepto hasta 12°?", chequeo_demo2),
    ("demo-3 alerta", "Alerta de polvo en la zona Z2. Recalcula.", chequeo_demo3),
    # Fuera del guion, pero puede pasar en vivo: una segunda alerta sobre la misma misión
    ("comms", "Perdimos la comunicación con el hábitat, recalcula la ruta.", chequeo_comms),
]
# Preguntas sueltas (sin historial)
SUELTAS = [
    ("info", "¿Qué tarea hay que hacer en Séítah sur y cuánto tiempo toma?", chequeo_info),
    ("ingles", "I want to go from the habitat to the delta front, max slope 15 degrees. How long?",
     lambda r: bool(args_de(r, "ruta_punto_a_punto") or args_de(r, "optimizar_mision"))),
    ("trampa", "¿Cuántos minutos dura la caminata?", None),  # no hay misión: no debe inventar números
    ("tres horas", "Quiero visitar el frente del delta y la cima del delta, volver en menos de 3 horas, "
                   "sin pendientes de más de 12°.", chequeo_tres_horas),
    ("ingles ruta", "How do I get from the habitat to Séítah with a maximum slope of 8 degrees?", chequeo_ingles_ruta),
    ("no existe", "¿Qué hay que hacer en la estación E9?", chequeo_no_existe),
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
