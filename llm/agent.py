"""
Bucle del copiloto: el modelo elige herramientas, nosotros las ejecutamos y le devolvemos el resultado,
hasta que responde en texto. Cada número de la respuesta debe venir de una herramienta.

Regla del proyecto: el LLM nunca calcula. Lo que haya que restar o comparar (por ejemplo, cuánto
tiempo suma aceptar 20°) lo calcula este archivo y se lo pasa al modelo como parte del resultado.
"""
import json
import re
import time

from ollama import Client

from config import KEEP_ALIVE, MAX_PASOS, MODELO, OLLAMA_URL, PENDIENTE_DEFAULT, TIEMPO_DEFAULT
from tools import TOOLS, _estaciones, _norm, _zonas, ejecutar

SYSTEM = """Eres MarsWalk Copilot, el asistente de planificación de caminatas (EVA) en el cráter Jezero, Marte.
Hablas con el tripulante del hábitat que apoya al astronauta en la superficie.

Reglas:
1. Nunca calcules rutas, distancias, tiempos ni diferencias tú mismo. Llama siempre a una herramienta y usa SOLO los números que devuelve.
2. Usa SIEMPRE los ids exactos del catálogo de abajo (E1, M1, HAB...). Nunca inventes ids. Si el usuario nombra un lugar que no está en el catálogo, pásalo tal cual y la herramienta dirá que no existe.
3. Para una o varias estaciones con tiempo límite usa optimizar_mision. Convierte horas a minutos (3 horas = 180, 4 horas = 240).
4. Si el usuario cambia una condición ("¿y si acepto 20°?"), vuelve a llamar a optimizar_mision con las MISMAS estaciones de la misión anterior y la condición nueva. Usa "comparacion_con_anterior" para decir qué cambió y cuánto tiempo suma o resta.
5. Para alertas de polvo o pérdida de comunicación usa recalcular_por_alerta. Explica qué tramos se evitaron.
6. Cuando una herramienta devuelve "resumen", basa tu respuesta en ese resumen y no agregues datos de respuestas anteriores.
7. Explica cada estación omitida con su motivo y su detalle:
   - pendiente: "el camino más suave tiene X° y el límite es Y°"
   - tiempo: "no entra en X minutos"
   - alerta: "queda aislada por la alerta en la zona X"
   - comms: "no hay camino con cobertura de comunicación suficiente"
   - no_existe: "no conozco esa estación"
8. Si falta un dato que no puedes obtener con herramientas, pregunta. No inventes.
9. Responde en el idioma del usuario (español o inglés), breve y claro: orden de la ruta con nombres, tiempo total, margen y omisiones. Sin tablas ni markdown pesado."""

_client = Client(host=OLLAMA_URL)
# Mismas opciones en el chat y en el precalentamiento: si num_ctx cambia, Ollama recarga el modelo.
_OPCIONES = {"temperature": 0, "num_ctx": 8192}
_CAMPOS_TRAMO = ("origen", "destino", "distancia_m", "tiempo_min", "pendiente_max_deg", "cobertura_com_pct", "zonas")
_NOMBRES_HERRAMIENTAS = {t["function"]["name"] for t in TOOLS}

# Estado de la conversación en curso (la demo tiene un solo usuario). Se limpia con historial vacío.
_ESTADO = {"mision": None, "resultado": None}


def reiniciar():
    _ESTADO.update(mision=None, resultado=None)


def _motivo_error(contenido):
    """Texto legible del error de una herramienta: {"error": [{"msg": "zona Z9 no existe"}]} -> 'zona Z9 no existe'."""
    try:
        err = json.loads(contenido).get("error", contenido)
    except (ValueError, AttributeError):
        return str(contenido)[:200]
    if isinstance(err, list):
        return "; ".join(str(e.get("msg", e)) if isinstance(e, dict) else str(e) for e in err)[:200]
    if isinstance(err, dict):
        return str(err.get("detail") or err.get("msg") or err)[:200]
    return str(err)[:200]


def precalentar(modelo=None):
    """Carga el modelo en la GPU sin generar nada (prompt vacío), para que la primera pregunta de la
    demo no espere la carga. Lo deja cargado KEEP_ALIVE. Devuelve {modelo, segundos} o {error}."""
    modelo = modelo or MODELO
    t0 = time.time()
    try:
        _client.generate(model=modelo, prompt="", options=_OPCIONES, keep_alive=KEEP_ALIVE)
    except Exception as e:  # Ollama apagado o modelo sin descargar
        return {"modelo": modelo, "error": f"{type(e).__name__}: {e}"}
    return {"modelo": modelo, "segundos": round(time.time() - t0, 1), "keep_alive": KEEP_ALIVE}


# ---------------------------------------------------------------- ayudas para el modelo
def _nombres():
    try:
        return {e["id"]: e["nombre"] for e in _estaciones()}
    except Exception:
        return {}


def _visitadas(pedidas, res):
    om = {o["id"] for o in res.get("omitidas", [])}
    return [s for s in pedidas if s not in om and s in res.get("ruta", [])]


def _comparar(anterior, nuevo, pedidas_ant, pedidas_nuevas):
    """Diferencias calculadas por código (no por el LLM) entre dos misiones."""
    if not anterior or not anterior.get("totales") or not nuevo.get("totales"):
        return None
    va, vn = _visitadas(pedidas_ant, anterior), _visitadas(pedidas_nuevas, nuevo)
    ta, tn = anterior["totales"].get("tiempo_min"), nuevo["totales"].get("tiempo_min")
    if ta is None or tn is None:
        return None
    return {"tiempo_anterior_min": ta, "tiempo_nuevo_min": tn,
            "diferencia_tiempo_min": round(tn - ta, 1),
            "estaciones_agregadas": [s for s in vn if s not in va],
            "estaciones_quitadas": [s for s in va if s not in vn]}


def _motivo_texto(o, nombres):
    n, d = nombres.get(o["id"], o["id"]), o.get("detalle") or {}
    m = o.get("motivo")
    if m == "pendiente":
        return f"{n}: el camino más suave tiene {d.get('pendiente_max_deg')}° y el límite es {d.get('limite'):g}°"
    if m == "tiempo":
        return f"{n}: no entra en {d.get('tiempo_max_min'):g} min"
    if m == "alerta":
        return f"{n}: queda aislada por la alerta en {', '.join(d.get('zonas') or [])}"
    if m == "comms":
        return f"{n}: no hay camino con cobertura de comunicación suficiente"
    if m == "no_existe":
        return f"{o['id']}: no existe en el mapa"
    return f"{n}: {m}"


def resumen(res, nombres):
    """Resumen de una RespuestaMision armado por código: el modelo solo lo redacta."""
    if not isinstance(res, dict) or "totales" not in res:
        return None
    if not res.get("ruta"):
        partes = ["No hay ruta factible con esas condiciones."]
    else:
        t = res["totales"]
        partes = [f"Ruta: {' → '.join(nombres.get(i, i) for i in res['ruta'])}.",
                  f"Tiempo total: {t.get('tiempo_min')} min. Distancia: {t.get('distancia_m')} m."]
        if t.get("margen_min") is not None:
            partes.append(f"Margen: {t['margen_min']} min.")
    om = res.get("omitidas") or []
    partes.append("Omitidas: " + ("; ".join(_motivo_texto(o, nombres) for o in om) if om else "ninguna") + ".")
    c = res.get("comparacion_con_anterior")
    if c:
        signo = "+" if c["diferencia_tiempo_min"] >= 0 else ""
        partes.append(f"Respecto a la misión anterior: {signo}{c['diferencia_tiempo_min']} min "
                      f"(de {c['tiempo_anterior_min']} a {c['tiempo_nuevo_min']} min); "
                      f"agregadas: {', '.join(nombres.get(s, s) for s in c['estaciones_agregadas']) or 'ninguna'}; "
                      f"quitadas: {', '.join(nombres.get(s, s) for s in c['estaciones_quitadas']) or 'ninguna'}.")
    if res.get("aristas_afectadas") is not None:
        evit = [" → ".join(nombres.get(x, x) for x in a.split("->")) for a in res["aristas_afectadas"]]
        partes.append("Tramos de la ruta anterior que cruzaban la zona y se evitaron: "
                      + ("; ".join(evit) if evit else "ninguno") + ".")
    return " ".join(partes)


def _para_modelo(res, nombres, nombre_tool=""):
    """Quita geometría y campos pesados (menos tokens = más rápido en CPU), agrega nombres a los ids
    y, en misiones, un resumen hecho por código que el modelo solo tiene que redactar."""
    if not isinstance(res, dict):
        return res
    out = dict(res)
    if nombre_tool in ("optimizar_mision", "recalcular_por_alerta") and "totales" in out:
        return {"resumen": resumen(res, nombres), "factible": res.get("factible"),
                "ruta": res.get("ruta"), "totales": res.get("totales"),
                "omitidas": res.get("omitidas"), "comparacion_con_anterior": res.get("comparacion_con_anterior"),
                "aristas_afectadas": res.get("aristas_afectadas")}
    if "tramos" in out:
        out["tramos"] = [{k: t.get(k) for k in _CAMPOS_TRAMO} for t in out["tramos"]]
    if out.get("ruta"):
        out["ruta_nombres"] = [nombres.get(i, i) for i in out["ruta"]]
    if out.get("omitidas"):
        out["omitidas"] = [{**o, "nombre": nombres.get(o["id"], o["id"])} for o in out["omitidas"]]
    if isinstance(out.get("estaciones"), list):
        out["estaciones"] = [{k: e.get(k) for k in ("id", "nombre", "tipo", "valor_cientifico")} for e in out["estaciones"]]
    out.pop("fotos", None)
    out.pop("geometria", None)
    return out


def _catalogo(nombres):
    """Ids y nombres de estaciones y zonas (no el grafo): así el modelo no inventa ids."""
    if not nombres:
        return ""
    tipos = {e["id"]: e["tipo"] for e in _estaciones()}
    lineas = ["\n\nCatálogo de estaciones (id: nombre, tipo):"]
    lineas += [f"- {i}: {n} ({tipos.get(i, '')})" for i, n in nombres.items()]
    zonas = _zonas()
    if zonas:
        lineas.append("Zonas de alerta: " + "; ".join(f"{z['id']}: {z['nombre']}" for z in zonas))
    return "\n".join(lineas)


def _contexto_mision(nombres):
    m = _ESTADO["mision"]
    if not m:
        return ""
    est = ", ".join(f"{s} ({nombres.get(s, s)})" for s in m["estaciones"])
    return (f"\n\nMisión anterior de esta conversación: estaciones [{est}], "
            f"tiempo_max_min={m['tiempo_max_min']:g}, pendiente_max={m['pendiente_max']:g}.")


# ---------------------------------------------------------------- números sin fuente
def _numeros_permitidos(textos):
    nums = set()
    for t in textos:
        for n in re.findall(r"\d+(?:[.,]\d+)?", t):
            v = float(n.replace(",", "."))
            nums.update({v, round(v), round(v, 1)})
            if v >= 60:  # permite expresar minutos como horas y minutos
                nums.update({float(int(v) // 60), float(round(v) % 60), round(v / 60, 1), round(v / 60, 2)})
            if v >= 1000:  # metros como km
                nums.update({round(v / 1000, 1), round(v / 1000, 2)})
    return nums


def numeros_sin_fuente(respuesta, fuentes):
    """Números de la respuesta que no aparecen en ninguna fuente (herramientas o mensajes del usuario)."""
    permitidos = _numeros_permitidos(fuentes)
    limpio = re.sub(r"\b[A-Z]{1,3}\d+\b", " ", respuesta)          # ids como E1, Z2, M1
    limpio = re.sub(r"(?m)^\s*\d+[.)]\s", " ", limpio)             # viñetas numeradas
    limpio = re.sub(r"(?<=\d)[.,](?=\d{3}\b)", "", limpio)         # separador de miles: 6.833 / 6,833
    return [n for n in re.findall(r"\d+(?:[.,]\d+)?", limpio)
            if float(n.replace(",", ".")) not in permitidos]


# ---------------------------------------------------------------- respaldo
def _llamadas_en_texto(texto):
    """Algunos modelos chicos escriben la llamada como JSON en el texto en vez de usar tool_calls."""
    llamadas = []
    for m in re.finditer(r"\{[^{}]*\"name\"\s*:\s*\"(\w+)\"[^{}]*(\{[^{}]*\})?[^{}]*\}", texto or ""):
        try:
            obj = json.loads(m.group(0))
        except ValueError:
            continue
        if obj.get("name") in _NOMBRES_HERRAMIENTAS:
            args = obj.get("arguments") or obj.get("parameters") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except ValueError:
                    args = {}
            llamadas.append((obj["name"], args))
    if llamadas:
        return llamadas
    # Formato "info_estacion {"id": "M1"}" o "info_estacion({...})"
    for nombre in _NOMBRES_HERRAMIENTAS:
        m = re.search(re.escape(nombre) + r"\W{0,3}(\{[^{}]*\})", texto or "")
        if m:
            try:
                llamadas.append((nombre, json.loads(m.group(1))))
            except ValueError:
                pass
    return llamadas


_RE_ALERTA = re.compile(r"\b(alerta|alert|polvo|dust|tormenta|storm|comms|comunicaci|communication|radio)", re.I)
_RE_COMMS = re.compile(r"(comms|comunicaci|communication|radio|se[ñn]al|signal)", re.I)
_RE_ZONA = re.compile(r"\b(?:z|zona|zone)\s*-?\s*(\d+)\b", re.I)


def detectar_alerta(mensaje):
    """Si el mensaje es una alerta, devuelve los argumentos de recalcular_por_alerta (sin LLM).
    Los modelos chicos tienden a 'recalcular' de memoria; esto obliga a usar la herramienta."""
    if not _RE_ALERTA.search(mensaje):
        return None
    if _RE_COMMS.search(mensaje):
        return {"tipo": "comms", "zona": ""}
    m = _RE_ZONA.search(mensaje)
    if m:
        return {"tipo": "polvo", "zona": f"Z{m.group(1)}"}
    texto = _norm(mensaje)
    for z in _zonas():
        if z.get("nombre") and _norm(z["nombre"]) in texto:
            return {"tipo": "polvo", "zona": z["id"]}
    return None  # alerta sin zona: que el modelo pregunte cuál


_RE_PENDIENTE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:°|º|grados?|degrees?|deg)", re.I)
_RE_HORAS = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:h\b|horas?|hours?|hrs?)", re.I)
_RE_MINUTOS = re.compile(r"(\d+)\s*(?:min\b|minutos?|minutes?)", re.I)


def detectar_cambio(mensaje, nombres):
    """'¿Y si acepto hasta 20°?' con una misión previa -> misma misión con la condición nueva (sin LLM).
    Si el mensaje nombra estaciones, no se fuerza: lo resuelve el modelo."""
    m = _ESTADO["mision"]
    if not m:
        return None
    texto = _norm(mensaje)
    if any(re.search(rf"\b{re.escape(i.lower())}\b", texto) for i in nombres):
        return None
    for n in nombres.values():
        palabras = [p for p in _norm(n).split() if len(p) > 4 and p not in ("delta", "muestras")]
        if any(p in texto for p in palabras):
            return None
    nuevo = dict(m)
    p, h, mi = _RE_PENDIENTE.search(mensaje), _RE_HORAS.search(mensaje), _RE_MINUTOS.search(mensaje)
    if p:
        nuevo["pendiente_max"] = float(p.group(1).replace(",", "."))
    if h:
        nuevo["tiempo_max_min"] = float(h.group(1).replace(",", ".")) * 60
    elif mi:
        nuevo["tiempo_max_min"] = float(mi.group(1))
    if nuevo == m:
        return None
    return {k: nuevo[k] for k in ("estaciones", "tiempo_max_min", "pendiente_max")}


# ---------------------------------------------------------------- historial
# Palabras de los nombres del catálogo que no sirven para reconocer una estación (se repiten o son genéricas)
_PALABRAS_COMUNES = {"delta", "muestras", "afloramiento", "base", "fondo", "llanura", "norte", "apoyo",
                     "habitat", "octavia", "butler", "deposito", "refugio", "frente"}
_RE_PEDIDO = re.compile(r"\b(visitar|visita|quiero|ir a|pasar por|recorrer|mision|caminata|visit|go to|mission|plan)\b")
_RE_MUESTREO = re.compile(r"\b(puntos?|sitios?|estaciones?|lugares?) de muestreo\b|\bsampling (points?|sites?|stations?)\b")


def _alias(nombre):
    """Frases y palabras con que se puede nombrar una estación: 'Cima del delta (Upper Fan)' ->
    {'cima del delta', 'upper fan'}; 'Séítah sur, afloramiento Brac' -> {'seitah sur', 'seitah', 'brac', ...}."""
    # cortar antes de normalizar: _norm borra las comas
    partes = nombre.replace("(", ",").replace(")", ",").split(",")
    frases = {_norm(f) for f in partes if _norm(f)}
    palabras = {p for f in frases for p in f.split() if len(p) >= 5 and p not in _PALABRAS_COMUNES}
    return frases | palabras


def detectar_mision(mensaje, nombres):
    """'Quiero visitar el frente del delta, los dos puntos de muestreo y la cima del delta, volver en menos de
    4 horas, sin pendientes de más de 8°' -> argumentos de optimizar_mision (sin LLM).

    Solo si es un pedido de misión que nombra al menos 2 estaciones y da tiempo o pendiente; si no, lo resuelve
    el modelo. Con qwen2.5:3b esta pregunta salía mal 3 de cada 4 veces (estaciones o minutos inventados)."""
    texto = _norm(mensaje)
    if not _RE_PEDIDO.search(texto):
        return None
    try:
        estaciones = [e for e in _estaciones() if e.get("tipo") != "habitat"]
    except Exception:
        return None
    ids = []
    for e in estaciones:
        if re.search(rf"\b{re.escape(e['id'].lower())}\b", texto) or \
                any(re.search(rf"\b{re.escape(a)}\b", texto) for a in _alias(e["nombre"])):
            ids.append(e["id"])
    if _RE_MUESTREO.search(texto):
        ids += [e["id"] for e in estaciones if e.get("tipo") == "muestreo"]
    ids = list(dict.fromkeys(ids))
    p, h, mi = _RE_PENDIENTE.search(mensaje), _RE_HORAS.search(mensaje), _RE_MINUTOS.search(mensaje)
    if len(ids) < 2 or not (p or h or mi):
        return None
    tiempo = float(h.group(1).replace(",", ".")) * 60 if h else float(mi.group(1)) if mi else TIEMPO_DEFAULT
    pendiente = float(p.group(1).replace(",", ".")) if p else PENDIENTE_DEFAULT
    return {"estaciones": ids, "tiempo_max_min": tiempo, "pendiente_max": pendiente, "modo": "orientacion"}


def normalizar_historial(historial):
    """Acepta el formato del contrato {rol, contenido} o el de Ollama {role, content}."""
    out = []
    for h in historial or []:
        rol = h.get("role") or {"usuario": "user", "asistente": "assistant"}.get(h.get("rol"), h.get("rol"))
        contenido = h.get("content", h.get("contenido", ""))
        if rol in ("user", "assistant") and contenido:
            out.append({"role": rol, "content": str(contenido)})
    return out


def _al_contrato(historial):
    return [{"rol": "usuario" if h["role"] == "user" else "asistente", "contenido": h["content"]} for h in historial]


# ---------------------------------------------------------------- bucle principal
def _ejecutar_y_registrar(nombre, args, llamadas, fuentes, nombres):
    enviado, res = ejecutar(nombre, args)
    ok = isinstance(res, dict) and "error" not in res
    ruta = None
    if ok and nombre in ("optimizar_mision", "recalcular_por_alerta") and "tramos" in res:
        pedidas = enviado.get("estaciones") or (_ESTADO["mision"] or {}).get("estaciones", [])
        pedidas_ant = (_ESTADO["mision"] or {}).get("estaciones", [])
        comp = _comparar(_ESTADO["resultado"], res, pedidas_ant, pedidas)
        if comp:
            res = {**res, "comparacion_con_anterior": comp}
        if nombre == "optimizar_mision":
            _ESTADO["mision"] = enviado
        _ESTADO["resultado"] = res
        ruta = res
    elif ok and nombre == "ruta_punto_a_punto" and "tramos" in res:
        ruta = res
    llamadas.append({"herramienta": nombre, "argumentos": enviado, "ok": ok})
    contenido = json.dumps(_para_modelo(res, nombres, nombre), ensure_ascii=False)
    fuentes.append(contenido)
    return contenido, ruta


def responder(mensaje, historial=None, modelo=None):
    """
    Devuelve el formato de POST /chat (contracts/api.md):
      {respuesta, llamadas: [{herramienta, argumentos, ok}], ruta}
    y además (campos agregados): historial, segundos, numeros_sin_fuente, error (si falló).
    historial: lista de {"rol": "usuario"|"asistente", "contenido": str} (o {role, content}).
    """
    modelo = modelo or MODELO
    historial = normalizar_historial(historial)
    if not historial:
        reiniciar()
    nombres = _nombres()
    mensajes = ([{"role": "system", "content": SYSTEM + _catalogo(nombres) + _contexto_mision(nombres)}]
                + historial + [{"role": "user", "content": mensaje}])
    llamadas, ruta, fuentes = [], None, [mensaje] + [h["content"] for h in historial]
    t0 = time.time()
    texto, reintentado = None, False

    def salida(respuesta, error=None):
        hist = historial + [{"role": "user", "content": mensaje}, {"role": "assistant", "content": respuesta}]
        out = {"respuesta": respuesta, "llamadas": llamadas, "ruta": ruta,
               "historial": _al_contrato(hist), "segundos": round(time.time() - t0, 1),
               "numeros_sin_fuente": numeros_sin_fuente(respuesta, fuentes) if not error else []}
        if error:
            out["error"] = error
        return out

    def ejecutar_lote(pedidas):
        nonlocal ruta
        for nombre, args in pedidas:
            contenido, nueva_ruta = _ejecutar_y_registrar(nombre, args, llamadas, fuentes, nombres)
            ruta = nueva_ruta or ruta
            mensajes.append({"role": "tool", "content": contenido, "tool_name": nombre})

    # Alertas, pedidos de misión y cambios de condición: la herramienta se llama siempre, no depende de que
    # el modelo se acuerde ni de que elija bien los argumentos.
    alerta = detectar_alerta(mensaje)
    forzada = ("recalcular_por_alerta", alerta) if alerta else None
    if not forzada:
        pedido = detectar_mision(mensaje, nombres)
        forzada = ("optimizar_mision", pedido) if pedido else None
    if not forzada and historial:
        cambio = detectar_cambio(mensaje, nombres)
        forzada = ("optimizar_mision", cambio) if cambio else None
    if forzada:
        mensajes.append({"role": "assistant", "content": "",
                         "tool_calls": [{"function": {"name": forzada[0], "arguments": forzada[1]}}]})
        ejecutar_lote([forzada])
        if llamadas and not llamadas[-1]["ok"]:
            # Si falla, que el modelo no redacte: tendería a repetir la ruta anterior como si fuera la nueva.
            return salida(f"No pude recalcular: {_motivo_error(mensajes[-1]['content'])}. "
                          "La ruta anterior sigue vigente; usa el formulario de misión si hace falta.")

    # Con la herramienta ya llamada por código, el modelo solo redacta: sin herramientas, para que no pida
    # otras (p. ej. ruta_punto_a_punto) que pisen la ruta de la misión.
    herramientas = None if forzada else TOOLS
    for _ in range(MAX_PASOS):
        try:
            r = _client.chat(model=modelo, messages=mensajes, tools=herramientas,
                             options=_OPCIONES, keep_alive=KEEP_ALIVE)
        except Exception as e:  # Ollama apagado, modelo no descargado, etc.
            return salida(f"El copiloto no está disponible ({type(e).__name__}). Usa el formulario de misión.", str(e))
        msg = r.message
        pedidas = [(tc.function.name, dict(tc.function.arguments or {})) for tc in (msg.tool_calls or [])]
        if not pedidas:
            pedidas = _llamadas_en_texto(msg.content)
            if pedidas:
                msg = {"role": "assistant", "content": "",
                       "tool_calls": [{"function": {"name": n, "arguments": a}} for n, a in pedidas]}
        if pedidas:
            mensajes.append(msg)
            ejecutar_lote(pedidas)
            continue
        texto = msg.content or ""
        malos = numeros_sin_fuente(texto, fuentes)
        if malos and not reintentado:
            # Una segunda oportunidad: que use una herramienta en vez de inventar.
            reintentado = True
            mensajes += [{"role": "assistant", "content": texto},
                         {"role": "user", "content": f"Revisa tu respuesta: los números {', '.join(malos)} no salen de "
                                                     "ninguna herramienta. Llama a la herramienta que corresponda y "
                                                     "responde usando solo sus datos, en el idioma de mi pregunta."}]
            texto = None
            continue
        break

    if texto and numeros_sin_fuente(texto, fuentes):
        # Siguió inventando: mejor el resumen hecho por código que un número falso en la demo.
        texto = resumen(ruta, nombres) if ruta else \
            "No tengo ese dato calculado todavía. Dime qué estaciones, tiempo máximo y pendiente quieres y lo calculo."
    if not texto or not texto.strip():
        texto = resumen(ruta, nombres) if ruta else \
            "No pude completar el cálculo. Prueba reformulando la petición o usa el formulario de misión."
    fuentes.append(texto)
    return salida(texto)
