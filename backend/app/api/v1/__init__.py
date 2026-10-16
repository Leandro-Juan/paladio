"""Backwards compatibility package alias for app.api."""

import importlib
import sys

_SUBMODULES = [
    "auth",
    "currency",
    "pois",
    "tickets",
    "trips",
    "users",
    "websockets",
]

for _name in _SUBMODULES:
    _mod = importlib.import_module(f"app.api.{_name}")
    sys.modules[f"app.api.v1.{_name}"] = _mod
    globals()[_name] = _mod
