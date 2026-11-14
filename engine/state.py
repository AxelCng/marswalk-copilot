"""Estado de la demo por proceso; todas las operaciones se serializan."""
from copy import deepcopy
from threading import RLock

from engine.graph import Restrictions


class NoPreviousMission(ValueError):
    pass


class UnknownZone(ValueError):
    pass


class MissionState:
    def __init__(self, planner, coverage_threshold):
        self.planner = planner
        self.store = planner.store
        self.coverage_threshold = coverage_threshold
        self.lock = RLock()
        self.restrictions = Restrictions()
        self.last_request = None
        self.last_result = None

    def graph(self, slope):
        with self.lock:
            return self.store.filtered(slope, self.restrictions)

    def route(self, origin, destination, slope):
        with self.lock:
            return self.store.route(origin, destination, slope, self.restrictions)

    def mission(self, request):
        with self.lock:
            result = self.planner.plan(request, self.restrictions)
            self.last_request = request.model_copy(deep=True)
            self.last_result = deepcopy(result)
            return result

    def alert(self, zone, kind):
        with self.lock:
            if self.last_request is None:
                raise NoPreviousMission("no hay mision para recalcular")
            if zone not in {z["id"] for z in self.store.data.get("zonas", [])}:
                raise UnknownZone(f"zona {zone} no existe")
            if kind == "polvo":
                added = Restrictions(frozenset([zone]))
                candidate = Restrictions(self.restrictions.closed_zones | {zone},
                                         self.restrictions.min_coverage)
            else:
                # El contrato aplica comms a todas las aristas, no solo a zona.
                added = Restrictions(min_coverage=self.coverage_threshold)
                candidate = Restrictions(self.restrictions.closed_zones, self.coverage_threshold)
            affected = list(dict.fromkeys(f'{e["origen"]}->{e["destino"]}'
                                          for e in self.last_result["tramos"] if added.blocks(e)))
            # Commit solo tras resolver: una respuesta 503 no deja una alerta
            # aplicada a medias ni sobrescribe la última misión válida.
            result = self.planner.plan(self.last_request, candidate)
            self.restrictions = candidate
            self.last_result = deepcopy(result)
            return {**result, "aristas_afectadas": affected}

    def reset(self):
        with self.lock:
            self.restrictions = Restrictions()
            self.last_request = None
            self.last_result = None
            return {"ok": True}
