"""Domain exceptions for Paladio Itinerary Engine v2."""


class ItineraryInfeasible(Exception):
    """Raised when an itinerary cannot be physically or logically scheduled."""


class RoutingUnavailable(Exception):
    """Raised when real routing (Valhalla) is unreachable and plan mode is not 'estimated'."""
