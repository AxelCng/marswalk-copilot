"""Misiones sobre caminos mínimos dirigidos y OR-Tools RoutingModel."""
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR

import networkx as nx
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from ortools.util import optional_boolean_pb2

from engine.graph import LEG_FIELDS, Restrictions

# Resolución de 0.001 minutos. Redondear hacia arriba nunca permite exceder
# el presupuesto real por truncamiento al convertir a enteros para OR-Tools.
TIME_SCALE = 1000


def ticks(minutes, rounding=ROUND_CEILING):
    return int((Decimal(str(minutes)) * TIME_SCALE).to_integral_value(rounding=rounding))


class MissionSolverUnavailable(RuntimeError):
    """La búsqueda no logró resolver el problema dentro del límite."""


def solve_order(stations, costs, service, values, time_limit, mode, penalty_per_value):
    """stations[0] es el origen; devuelve índices de paradas o None si inviable.

    RoutingModel usa su backend CP-SAT para resolver el modelo de un vehículo.
    Una solución no probada óptima no se presenta como óptima al cliente.
    """
    size = len(stations)
    manager = pywrapcp.RoutingIndexManager(size, 1, 0)
    routing = pywrapcp.RoutingModel(manager)
    matrix = [[0 if a == b else costs[a][b] + service[a]
               for b in range(size)] for a in range(size)]
    upper_bound = max(max(row) for row in matrix) * size
    capacity = upper_bound if time_limit is None else min(ticks(time_limit, ROUND_FLOOR), upper_bound)

    def transit(a, b):
        return matrix[manager.IndexToNode(a)][manager.IndexToNode(b)]

    callback = routing.RegisterTransitCallback(transit)
    routing.SetArcCostEvaluatorOfAllVehicles(callback)
    routing.AddDimension(callback, 0, capacity, True, "Tiempo")
    if mode == "orientacion":
        # Prioridad lexicográfica: ciencia primero, tiempo después. K del YAML
        # se amplía solo si el presupuesto podría superar una unidad de valor.
        value_scale = 10 ** max(0, max(-Decimal(str(v)).as_tuple().exponent for v in values))
        penalty = max(ticks(penalty_per_value), capacity + 1)
        for index in range(1, size):
            value = int(Decimal(str(values[index])) * value_scale)
            routing.AddDisjunction([manager.NodeToIndex(index)], value * penalty)
        # Una misión solicitada debe efectuar al menos una tarea.
        routing.NextVar(routing.Start(0)).RemoveValue(routing.End(0))

    parameters = pywrapcp.DefaultRoutingSearchParameters()
    parameters.use_cp = optional_boolean_pb2.BOOL_FALSE
    parameters.use_generalized_cp_sat = optional_boolean_pb2.BOOL_TRUE
    parameters.sat_parameters.num_workers = 1
    parameters.time_limit.seconds = 5
    solution = routing.SolveWithParameters(parameters)
    status = routing.status()
    # El backend generalizado devuelve FAIL cuando termina sin solución;
    # INFEASIBLE se reserva para contradicciones detectadas al cerrar el modelo.
    if status in (routing_enums_pb2.RoutingSearchStatus.ROUTING_INFEASIBLE,
                  routing_enums_pb2.RoutingSearchStatus.ROUTING_FAIL):
        return None
    if solution is None or status != routing_enums_pb2.RoutingSearchStatus.ROUTING_OPTIMAL:
        raise MissionSolverUnavailable("el optimizador no pudo certificar una solucion optima; reintenta")
    order = []
    cursor = solution.Value(routing.NextVar(routing.Start(0)))
    while not routing.IsEnd(cursor):
        order.append(manager.IndexToNode(cursor))
        cursor = solution.Value(routing.NextVar(cursor))
    return order


class MissionPlanner:
    def __init__(self, store, penalty_per_value):
        self.store = store
        self.penalty_per_value = penalty_per_value

    def plan(self, request, restrictions=Restrictions()):
        origin = request.origen
        graph = self.store.network(request.pendiente_max, restrictions)
        # Dijkstra trabaja con unidades enteras para que matriz y presupuesto
        # usen exactamente los mismos costos, incluso con decimales binarios.
        for _, _, edge in graph.edges(data=True):
            edge["ticks"] = ticks(edge["tiempo_min"])
        distances, paths = {}, {}
        for node in graph:
            distances[node], paths[node] = nx.single_source_dijkstra(graph, node, weight="ticks")
        requested = [n for n in dict.fromkeys(request.estaciones) if n != origin]
        omitted, candidates = [], []
        for node in requested:
            if node not in self.store.nodes:
                omitted.append({"id": node, "motivo": "no_existe", "detalle": {}})
            elif node not in distances[origin] or origin not in distances[node]:
                omitted.append(self.store.omission(origin, node, request.pendiente_max,
                                                   restrictions, round_trip=True))
            else:
                candidates.append(node)

        if request.modo == "tsp" and omitted:
            return self.response([], [], omitted, 0, request.tiempo_max_min, False)
        if not candidates:
            return self.response([origin] if not requested else [], [], omitted, 0,
                                 request.tiempo_max_min, not requested)

        stations = [origin, *candidates]
        costs = [[distances[a][b] for b in stations] for a in stations]
        service = [0, *[ticks(self.store.nodes[n]["permanencia_min"]) for n in candidates]]
        values = [0, *[self.store.nodes[n]["valor_cientifico"] for n in candidates]]
        order = solve_order(stations, costs, service, values, request.tiempo_max_min,
                            request.modo, self.penalty_per_value)
        visited = [] if order is None else [stations[i] for i in order]
        omitted.extend({"id": n, "motivo": "tiempo", "detalle": {"tiempo_max_min": request.tiempo_max_min}}
                       for n in candidates if n not in visited)
        if order is None:
            return self.response([], [], omitted, 0, request.tiempo_max_min, False)
        route = [origin]
        for a, b in zip([origin, *visited], [*visited, origin]):
            route.extend(paths[a][b][1:])
        legs = [{key: graph[a][b][key] for key in LEG_FIELDS} for a, b in zip(route, route[1:])]
        stay = sum(self.store.nodes[n]["permanencia_min"] for n in visited)
        return self.response(route, legs, omitted, stay, request.tiempo_max_min, True)

    @staticmethod
    def response(route, legs, omitted, stay, budget, feasible):
        total = round(sum(e["tiempo_min"] for e in legs) + stay, 1)
        return {"factible": feasible, "ruta": route, "tramos": legs, "omitidas": omitted,
                "totales": {"distancia_m": round(sum(e["distancia_m"] for e in legs), 1),
                            "tiempo_min": total, "dosis_rel": round(sum(e["dosis_rel"] for e in legs), 1),
                            "margen_min": None if budget is None else round(budget - total, 1)}}
