"""Carga y consulta del grafo dirigido, sin modificar el contrato compartido."""
import json
from dataclasses import dataclass
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parents[1]
SUMMARY_FIELDS = ("id", "nombre", "tipo", "valor_cientifico", "lon", "lat")
LEG_FIELDS = ("origen", "destino", "distancia_m", "tiempo_min",
              "pendiente_max_deg", "cobertura_com_pct", "dosis_rel", "zonas", "geometria")


@dataclass(frozen=True)
class Restrictions:
    closed_zones: frozenset[str] = frozenset()
    min_coverage: float | None = None

    def blocks(self, edge):
        return bool(self.closed_zones.intersection(edge["zonas"])) or (
            self.min_coverage is not None and edge["cobertura_com_pct"] < self.min_coverage)


class GraphStore:
    def __init__(self, path):
        path = Path(path)
        if not path.is_absolute():
            path = ROOT / path
        self.data = json.loads(path.read_text(encoding="utf-8"))
        self.nodes = {node["id"]: node for node in self.data["nodes"]}
        self.limits = sorted(self.data["meta"]["limites_pendiente_deg"])

    def filtered(self, slope, restrictions=Restrictions()):
        version = max((v for v in self.limits if v <= slope), default=self.limits[0])
        return {**self.data, "edges": [e for e in self.data["edges"]
                if e["limite_deg"] == version and e["pendiente_max_deg"] <= slope
                and not restrictions.blocks(e)]}

    def network(self, slope, restrictions=Restrictions()):
        graph = nx.DiGraph()
        graph.add_nodes_from(self.nodes)
        for edge in self.filtered(slope, restrictions)["edges"]:
            graph.add_edge(edge["origen"], edge["destino"], **edge)
        return graph

    def minimum_slope(self, origin, destination):
        # Minimax: el menor máximo de pendiente entre todos los caminos.
        costs = {origin: 0.0}
        pending = set(self.nodes)
        while pending:
            current = min(pending, key=lambda n: costs.get(n, float("inf")))
            pending.remove(current)
            if current not in costs:
                break
            if current == destination:
                return costs[current]
            for edge in self.data["edges"]:
                if edge["origen"] == current:
                    target = edge["destino"]
                    cost = max(costs[current], edge["pendiente_max_deg"])
                    costs[target] = min(costs.get(target, float("inf")), cost)
        return None

    @staticmethod
    def widest_coverage(graph, origin, destination):
        """Máxima cobertura mínima de un camino dirigido (widest path)."""
        best = {origin: 100}
        pending = set(graph)
        while pending:
            current = max(pending, key=lambda n: best.get(n, -1))
            pending.remove(current)
            if current not in best:
                return None
            if current == destination:
                return best[current]
            for target, edge in graph[current].items():
                candidate = min(best[current], edge["cobertura_com_pct"])
                best[target] = max(best.get(target, -1), candidate)
        return None

    def omission(self, origin, destination, slope, restrictions=Restrictions(), round_trip=False):
        """Explica un nodo inaccesible: pendiente, luego polvo, luego comms.

        El orden fija una causa reproducible cuando varias restricciones se
        solapan; comunicaciones se evalúa sobre el grafo ya cerrado por polvo.
        """
        pairs = [(origin, destination)]
        if round_trip:
            pairs.append((destination, origin))
        base = self.network(slope)
        if not all(nx.has_path(base, a, b) for a, b in pairs):
            slopes = [self.minimum_slope(a, b) for a, b in pairs]
            detail = {"pendiente_max_deg": None if None in slopes else max(slopes), "limite": slope}
            return {"id": destination, "motivo": "pendiente", "detalle": detail}
        dust = self.network(slope, Restrictions(restrictions.closed_zones))
        if not all(nx.has_path(dust, a, b) for a, b in pairs):
            return {"id": destination, "motivo": "alerta",
                    "detalle": {"zonas": sorted(restrictions.closed_zones)}}
        coverage = min(self.widest_coverage(dust, a, b) for a, b in pairs)
        return {"id": destination, "motivo": "comms", "detalle": {
            "cobertura_com_pct": coverage, "umbral": restrictions.min_coverage}}

    def route(self, origin, destination, slope, restrictions=Restrictions()):
        graph = self.network(slope, restrictions)
        omitted = []
        try:
            path = nx.dijkstra_path(graph, origin, destination, weight="tiempo_min")
        except nx.NetworkXNoPath:
            path = []
            omitted = [self.omission(origin, destination, slope, restrictions)]
        legs = [{key: graph[a][b][key] for key in LEG_FIELDS}
                for a, b in zip(path, path[1:])]
        return {"factible": bool(path), "ruta": path, "tramos": legs, "omitidas": omitted,
                "totales": {**{key: round(sum(e[key] for e in legs), 1)
                               for key in ("distancia_m", "tiempo_min", "dosis_rel")},
                            "margen_min": None}}
