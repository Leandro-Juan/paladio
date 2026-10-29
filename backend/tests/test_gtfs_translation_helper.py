import os
import tempfile

from app.services.gtfs_translation_helper import GTFSTranslationHelper


def test_gtfs_translation_helper_record_id_and_field_value():
    with tempfile.TemporaryDirectory() as tmpdir:
        trans_path = os.path.join(tmpdir, "translations.txt")
        with open(trans_path, "w", encoding="utf-8") as f:
            f.write(
                "table_name,field_name,language,translation,record_id,record_sub_id,field_value\n"
            )
            # 1. record_id based translation
            f.write("stops,stop_name,en,Tokyo Station,stop_tokyo_01,,東京駅\n")
            f.write("stops,stop_name,es,Estación de Tokio,stop_tokyo_01,,東京駅\n")
            # 2. field_value based translation
            f.write("stops,stop_name,en,Shinjuku Station,,,新宿駅\n")
            f.write("routes,route_name,en,Yamanote Line,route_ymnt_01,,\n")

        helper = GTFSTranslationHelper(tmpdir)

        # 1. Test record_id lookup in English
        display, orig = helper.get_stop_name(
            "東京駅", stop_id="stop_tokyo_01", target_lang="en"
        )
        assert display == "Tokyo Station"
        assert orig == "東京駅"

        # 2. Test record_id lookup in Spanish
        display_es, orig_es = helper.get_stop_name(
            "東京駅", stop_id="stop_tokyo_01", target_lang="es"
        )
        assert display_es == "Estación de Tokio"
        assert orig_es == "東京駅"

        # 3. Test field_value lookup
        display_sh, orig_sh = helper.get_stop_name(
            "新宿駅", stop_id=None, target_lang="en"
        )
        assert display_sh == "Shinjuku Station"
        assert orig_sh == "新宿駅"

        # 4. Test route record_id lookup
        r_name = helper.get_route_name(
            "山手線", route_id="route_ymnt_01", target_lang="en"
        )
        assert r_name == "Yamanote Line"

        # 5. Non-translated fallback preserves original
        disp_untr, orig_untr = helper.get_stop_name("秋葉原駅", stop_id="unknown_01")
        assert disp_untr == "秋葉原駅"
        assert orig_untr is None
