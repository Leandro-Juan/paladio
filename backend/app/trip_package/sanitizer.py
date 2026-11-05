"""Sanitization pipeline for .trip export profiles (e.g. community_shareable)."""

import copy
from typing import Any


class TripSanitizer:
    """Scrubs personal identifiable information and sensitive travel documents."""

    @classmethod
    def sanitize_for_sharing(
        cls,
        itinerary: dict[str, Any],
        wallet: dict[str, Any],
        expenses: dict[str, Any],
        collections: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
        """Applies community_shareable privacy rules across all package sections."""
        clean_itin = cls._sanitize_itinerary(itinerary)
        clean_wallet = cls._sanitize_wallet(wallet)
        clean_expenses = cls._sanitize_expenses(expenses)
        clean_collections = cls._sanitize_collections(collections)
        return clean_itin, clean_wallet, clean_expenses, clean_collections

    @classmethod
    def _sanitize_itinerary(cls, itin: dict[str, Any]) -> dict[str, Any]:
        data = copy.deepcopy(itin)
        # Itinerary schedule, POIs, coordinates and maneuvers are safe to share.
        return data

    @classmethod
    def _sanitize_wallet(cls, wallet: dict[str, Any]) -> dict[str, Any]:
        data = copy.deepcopy(wallet)
        sanitized_tickets = []
        for t in data.get("tickets", []):
            st = dict(t)
            # Scrub sensitive booking codes and traveler PII
            st.pop("reference_code", None)
            st.pop("barcode_payload", None)
            st.pop("holder_name", None)
            st.pop("raw_barcode", None)
            st.pop("attachments", None)
            sanitized_tickets.append(st)

        data["tickets"] = sanitized_tickets
        # Remove raw attachments (boarding pass PDFs, PKPass archives)
        data["attachments"] = []
        return data

    @classmethod
    def _sanitize_expenses(cls, expenses: dict[str, Any]) -> dict[str, Any]:
        data = copy.deepcopy(expenses)
        # Strip all financial amounts and transactions for public sharing
        data["expenses"] = []
        data["settlement"] = {}

        # Anonymize participants to generic traveler handles without emails or IDs
        sanitized_participants = []
        for idx, p in enumerate(data.get("participants", []), start=1):
            sanitized_participants.append(
                {
                    "id": f"traveler-{idx}",
                    "name": f"Traveler {idx}",
                    "role": p.get("role", "traveler"),
                }
            )
        data["participants"] = sanitized_participants
        return data

    @classmethod
    def _sanitize_collections(cls, collections: dict[str, Any]) -> dict[str, Any]:
        data = copy.deepcopy(collections)
        # Curated places and packing lists remain safe
        return data
