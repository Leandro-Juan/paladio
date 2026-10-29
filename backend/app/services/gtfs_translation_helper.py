import csv
import logging
import os

logger = logging.getLogger(__name__)


class GTFSTranslationHelper:
    """
    Loads and provides multi-language lookup for GTFS translations.txt.
    Supports both GTFS translation styles:
      - record_id-based: (table_name, field_name, record_id, language)
      - field_value-based: (table_name, field_name, field_value, language)
    Provides user language selection with English fallback and original native text preservation.
    """

    def __init__(self, gtfs_dir: str, default_lang: str = "en"):
        self.gtfs_dir = gtfs_dir
        self.default_lang = default_lang.lower().strip()
        # Key: (table_name, lookup_type, lookup_key, lang) -> translated text
        self.translations: dict[tuple[str, str, str, str], str] = {}
        # Legacy fallback compatibility dictionary: (table_name, field_value) -> en_translation
        self._legacy_map: dict[tuple[str, str], str] = {}
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
                    if not lang:
                        continue
                    table_name = (row.get("table_name") or "").strip().lower()
                    record_id = (row.get("record_id") or "").strip()
                    field_value = (row.get("field_value") or "").strip()
                    translation = (row.get("translation") or "").strip()

                    if not translation:
                        continue

                    # 1. Record ID lookup
                    if table_name and record_id:
                        self.translations[(table_name, "id", record_id, lang)] = (
                            translation
                        )

                    # 2. Field Value lookup
                    if table_name and field_value:
                        self.translations[(table_name, "val", field_value, lang)] = (
                            translation
                        )
                        if lang == "en":
                            self._legacy_map[(table_name, field_value)] = translation
        except Exception as e:
            logger.debug(f"Could not load translations.txt from {self.gtfs_dir}: {e}")

    def get_stop_name(
        self,
        raw_name: str,
        stop_id: str | None = None,
        target_lang: str | None = None,
    ) -> tuple[str, str | None]:
        """
        Returns (display_name, original_name).
        Looks up by record_id (stop_id) first, then field_value (raw_name).
        Falls back to target_lang, then English, then raw_name.
        """
        if not raw_name:
            return "", None

        langs_to_try = [target_lang.lower().strip()] if target_lang else []
        if self.default_lang not in langs_to_try:
            langs_to_try.append(self.default_lang)
        if "en" not in langs_to_try:
            langs_to_try.append("en")

        # 1. Check record_id
        if stop_id:
            for lang_code in langs_to_try:
                t = self.translations.get(("stops", "id", stop_id, lang_code))
                if t and t != raw_name:
                    return t, raw_name

        # 2. Check field_value
        for lang_code in langs_to_try:
            t = self.translations.get(("stops", "val", raw_name, lang_code))
            if t and t != raw_name:
                return t, raw_name

        # 3. Check legacy map
        t_leg = self._legacy_map.get(("stops", raw_name))
        if t_leg and t_leg != raw_name:
            return t_leg, raw_name

        return raw_name, None

    def get_route_name(
        self,
        raw_name: str,
        route_id: str | None = None,
        target_lang: str | None = None,
    ) -> str:
        """Returns translated route name if available, else raw_name."""
        if not raw_name:
            return ""

        langs_to_try = [target_lang.lower().strip()] if target_lang else []
        if self.default_lang not in langs_to_try:
            langs_to_try.append(self.default_lang)
        if "en" not in langs_to_try:
            langs_to_try.append("en")

        if route_id:
            for lang_code in langs_to_try:
                t = self.translations.get(("routes", "id", route_id, lang_code))
                if t:
                    return t

        for lang_code in langs_to_try:
            t = self.translations.get(("routes", "val", raw_name, lang_code))
            if t:
                return t

        return self._legacy_map.get(("routes", raw_name), raw_name)
