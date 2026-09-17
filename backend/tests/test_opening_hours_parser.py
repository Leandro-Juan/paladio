from app.utils.opening_hours_parser import (
    parse_osm_opening_hours,
    parse_time_to_minutes,
)


def test_parse_time_to_minutes():
    assert parse_time_to_minutes("00:00") == 0
    assert parse_time_to_minutes("08:30") == 510
    assert parse_time_to_minutes("12:00") == 720
    assert parse_time_to_minutes("23:45") == 1425


def test_parse_none_and_empty():
    res1 = parse_osm_opening_hours(None)
    assert res1.open_time_mins_by_day == [480] * 7
    assert res1.close_time_mins_by_day == [1320] * 7

    res2 = parse_osm_opening_hours("")
    assert res2.open_time_mins_by_day == [480] * 7
    assert res2.close_time_mins_by_day == [1320] * 7


def test_parse_24_7():
    res = parse_osm_opening_hours("24/7")
    assert res.open_time_mins_by_day == [0] * 7
    assert res.close_time_mins_by_day == [1440] * 7


def test_parse_simple_time_range():
    res = parse_osm_opening_hours("10:00-20:00")
    assert res.open_time_mins_by_day == [600] * 7
    assert res.close_time_mins_by_day == [1200] * 7


def test_parse_midnight_crossing_normalization():
    # Nightlife / bar: 20:00 to 02:00
    res = parse_osm_opening_hours("20:00-02:00")
    # 20:00 is 1200, 02:00 is 120 -> 120 + 1440 = 1560
    assert res.open_time_mins_by_day == [1200] * 7
    assert res.close_time_mins_by_day == [1560] * 7
    for o, c in zip(res.open_time_mins_by_day, res.close_time_mins_by_day):
        assert c >= o, f"Expected closing ({c}) >= opening ({o})"


def test_parse_multi_day_rules():
    # Louvre / Notre-Dame style: Mo-Fr 09:30-18:00; Sa 09:30-18:30; Su 13:30-18:30
    schedule_str = "Mo-Fr 09:30-18:00; Sa 09:30-18:30; Su 13:30-18:30"
    res = parse_osm_opening_hours(schedule_str)

    # Mo (0) to Fr (4): 09:30 to 18:00 (570 to 1080)
    for day in range(5):
        assert res.open_time_mins_by_day[day] == 570
        assert res.close_time_mins_by_day[day] == 1080

    # Sa (5): 09:30 to 18:30 (570 to 1110)
    assert res.open_time_mins_by_day[5] == 570
    assert res.close_time_mins_by_day[5] == 1110

    # Su (6): 13:30 to 18:30 (810 to 1110)
    assert res.open_time_mins_by_day[6] == 810
    assert res.close_time_mins_by_day[6] == 1110


def test_parse_explicit_closed_day():
    # Museum closed on Monday: Tu-Su 10:00-18:00; Mo off
    schedule_str = "Tu-Su 10:00-18:00; Mo off"
    res = parse_osm_opening_hours(schedule_str)

    # Mo (0) must be -1 (closed)
    assert res.open_time_mins_by_day[0] == -1
    assert res.close_time_mins_by_day[0] == -1

    # Tu (1) to Su (6) must be open 10:00 to 18:00 (600 to 1080)
    for day in range(1, 7):
        assert res.open_time_mins_by_day[day] == 600
        assert res.close_time_mins_by_day[day] == 1080
