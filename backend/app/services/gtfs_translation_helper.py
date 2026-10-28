import csv
import logging
import os

logger = logging.getLogger(__name__)


class GTFSTranslationHelper:
    """
    Loads and provides lookup for GTFS translations.txt.
    Supports English ("en") translations for table fields such as stops and routes.
    """

    def __init__(self, gtfs_dir: str):
        self.gtfs_dir = gtfs_dir
        self.translations: dict[tuple[str, str], str] = {}
        self.load()

    def load(self) -> None:
        trans_file = os.path.join(self.gtfs_dir, "translations.txt")
        if not os.path.exists(trans_file):
            return

        try:
            with open(trans_file, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    lang = (row.get("language") or "").strip().lower()
                    if lang == "en":
                        table_name = (row.get("table_name") or "").strip()
                        field_value = (row.get("field_value") or "").strip()
                        translation = (row.get("translation") or "").strip()
                        if table_name and field_value and translation:
                            self.translations[(table_name, field_value)] = translation
        except Exception as e:
            logger.debug(f"Could not load translations.txt from {self.gtfs_dir}: {e}")

    def get_stop_name(self, raw_name: str) -> tuple[str, str | None]:
        """
        Returns (display_name, original_name).
        If translated: display_name is English, original_name is raw Japanese/native name.
        If not translated: display_name is raw_name, original_name is None.
        """
        if not raw_name:
            return "", None
        en_name = self.translations.get(("stops", raw_name))
        if en_name and en_name != raw_name:
            return en_name, raw_name
        return raw_name, None

    def get_route_name(self, raw_name: str) -> str:
        """
        Returns translated route name if available, else raw_name.
        """
        if not raw_name:
            return ""
        return self.translations.get(("routes", raw_name), raw_name)
