"""Backwards compatibility package alias for app.engine."""

import importlib
import sys

_SUBMODULES = [
    "budget",
    "candidate_pool",
    "city_readiness",
    "currency",
    "day_assignment",
    "exceptions",
    "feasibility",
    "meals",
    "osm_signals",
    "pipeline",
    "rhythm",
    "selection",
    "solver",
    "taxonomy",
    "tiering",
    "trip_frame",
]

for _name in _SUBMODULES:
    _mod = importlib.import_module(f"app.engine.{_name}")
    sys.modules[f"app.engine.v2.{_name}"] = _mod
    globals()[_name] = _mod
