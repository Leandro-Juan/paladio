import uuid
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.trip_editing.expense_service import ExpenseService
from app.application.trip_editing.itinerary_editor import ItineraryEditor
from app.application.trip_editing.participant_service import ParticipantService
from app.application.trip_editing.trip_service import TripService
from app.db.models import TripModel, TripParticipantModel
from app.domain.schemas.itinerary_document import (
    DayItinerary,
    DayPlan,
    ItineraryDocument,
    Stop,
)


def test_itinerary_editor_pure_ops():
    # Setup initial doc
    stop1 = Stop(stop_id="s1", poi={"id": "poi1", "name": "Museo del Prado"})
    stop2 = Stop(stop_id="s2", poi={"id": "poi2", "name": "Retiro Park"})
    day1 = DayPlan(day=1, itinerary=DayItinerary(path=[stop1, stop2]))
    day2 = DayPlan(day=2, itinerary=DayItinerary(path=[]))
    doc = ItineraryDocument(days=[day1, day2])

    # 1. Add stop
    cs, new_stop = ItineraryEditor.add_stop(
        doc, day=1, poi={"id": "poi3", "name": "Reina Sofia"}, after_stop_id="s1"
    )
    assert cs.ok is True
    assert len(doc.days[0].itinerary.path) == 3
    assert doc.days[0].itinerary.path[1].stop_id == new_stop.stop_id

    # 2. Move stop to Day 2
    cs_move = ItineraryEditor.move_stop(doc, stop_id=new_stop.stop_id, to_day=2)
    assert cs_move.ok is True
    assert len(doc.days[0].itinerary.path) == 2
    assert len(doc.days[1].itinerary.path) == 1
    assert doc.days[1].itinerary.path[0].stop_id == new_stop.stop_id

    # 3. Reorder Day 1
    cs_reorder = ItineraryEditor.reorder_day(doc, day=1, ordered_stop_ids=["s2", "s1"])
    assert cs_reorder.ok is True
    assert doc.days[0].itinerary.path[0].stop_id == "s2"
    assert doc.days[0].itinerary.path[1].stop_id == "s1"

    # 4. Lock stop and set time
    cs_lock = ItineraryEditor.set_stop_time(
        doc, stop_id="s2", scheduled_start="10:00", lock=True
    )
    assert cs_lock.ok is True
    assert doc.days[0].itinerary.path[0].is_locked is True
    assert doc.days[0].itinerary.path[0].scheduled_start == "10:00"
    assert "s2" in doc.days[0].locked_stops

    # 5. Swap days
    cs_swap = ItineraryEditor.swap_days(doc, day_a=1, day_b=2)
    assert cs_swap.ok is True
    assert len(doc.days[0].itinerary.path) == 1
    assert len(doc.days[1].itinerary.path) == 2

    # 6. Add meal
    cs_meal, meal_stop = ItineraryEditor.add_meal(doc, day=1, meal_type="lunch")
    assert cs_meal.ok is True
    assert len(doc.days[0].itinerary.path) == 2

    # 7. Add & Remove day
    cs_add_day = ItineraryEditor.add_day(doc)
    assert cs_add_day.ok is True
    assert len(doc.days) == 3
    cs_rem_day = ItineraryEditor.remove_day(doc, day=3)
    assert cs_rem_day.ok is True
    assert len(doc.days) == 2

    # 8. Pace
    cs_pace = ItineraryEditor.set_pace(doc, pace="relaxed")
    assert cs_pace.ok is True
    assert doc.travel_constraints["pace"] == "relaxed"


@pytest.mark.asyncio
async def test_participant_service_last_participant_guard(db_session: AsyncSession):
    trip_id = f"trip_{uuid.uuid4().hex[:8]}"
    trip = TripModel(
        id=trip_id,
        user_id=None,
        destination="Madrid",
        start_date="2026-11-01",
        end_date="2026-11-03",
        itinerary_data={"days": []},
    )
    p1 = TripParticipantModel(
        id=f"p1_{uuid.uuid4().hex[:6]}",
        trip_id=trip_id,
        name="Solo Traveler",
    )
    db_session.add_all([trip, p1])
    await db_session.commit()

    # 1. Removing the only participant must fail
    with pytest.raises(HTTPException) as exc:
        await ParticipantService.remove_participant(trip_id, p1.id, None, db_session)
    assert exc.value.status_code == 400
    assert "last participant" in exc.value.detail.lower()

    # 2. Add a second participant
    p2 = await ParticipantService.add_participant(
        trip_id, "Second Traveler", None, db_session
    )
    assert p2.name == "Second Traveler"

    # 3. Now removing p1 succeeds
    res_del = await ParticipantService.remove_participant(
        trip_id, p1.id, None, db_session
    )
    assert res_del["status"] == "success"

    # 4. Remaining participant is only 1, so removing p2 fails again
    with pytest.raises(HTTPException) as exc2:
        await ParticipantService.remove_participant(trip_id, p2.id, None, db_session)
    assert exc2.value.status_code == 400


@pytest.mark.asyncio
async def test_expense_service_splits_and_settlement(db_session: AsyncSession):
    trip_id = f"trip_{uuid.uuid4().hex[:8]}"
    trip = TripModel(
        id=trip_id,
        user_id=None,
        destination="Madrid",
        start_date="2026-11-01",
        end_date="2026-11-03",
        itinerary_data={"days": []},
    )
    p_alice = TripParticipantModel(
        id=f"p_alice_{uuid.uuid4().hex[:6]}", trip_id=trip_id, name="Alice"
    )
    p_bob = TripParticipantModel(
        id=f"p_bob_{uuid.uuid4().hex[:6]}", trip_id=trip_id, name="Bob"
    )
    p_charlie = TripParticipantModel(
        id=f"p_charlie_{uuid.uuid4().hex[:6]}", trip_id=trip_id, name="Charlie"
    )
    db_session.add_all([trip, p_alice, p_bob, p_charlie])
    await db_session.commit()

    # 1. Equal split: Alice pays 90 EUR for dinner
    exp1 = await ExpenseService.add_expense(
        trip_id=trip_id,
        payer_id=p_alice.id,
        amount=90.0,
        description="Dinner",
        user=None,
        session=db_session,
        split_type="equal",
    )
    assert len(exp1.splits) == 3
    assert exp1.splits[0]["amount"] == 30.0

    # 2. Exclude Charlie: Bob pays 40 EUR for lunch (Alice & Bob only)
    exp2 = await ExpenseService.add_expense(
        trip_id=trip_id,
        payer_id=p_bob.id,
        amount=40.0,
        description="Lunch without Charlie",
        user=None,
        session=db_session,
        split_type="exclude-participant",
        excluded_participant_ids=[p_charlie.id],
    )
    assert len(exp2.splits) == 2
    assert all(s["participant_id"] != p_charlie.id for s in exp2.splits)
    assert exp2.splits[0]["amount"] == 20.0

    # 3. Settlement calculation
    settlement = await ExpenseService.get_settlement(
        trip_id, None, db_session, simplify=True
    )
    assert settlement["total_expenses"] == 130.0
    # Alice paid 90, share is 30 (dinner) + 20 (lunch) = 50 -> net +40
    # Bob paid 40, share is 30 (dinner) + 20 (lunch) = 50 -> net -10
    # Charlie paid 0, share is 30 (dinner) = 30 -> net -30
    balances_map = {
        b["participant_id"]: b["net_balance"] for b in settlement["balances"]
    }
    assert balances_map[p_alice.id] == 40.0
    assert balances_map[p_bob.id] == -10.0
    assert balances_map[p_charlie.id] == -30.0

    # Simplified transfers should show Charlie pays Alice 30, Bob pays Alice 10
    assert len(settlement["transfers"]) == 2
    transfers = settlement["transfers"]
    receivers = {t["receiver_id"] for t in transfers}
    assert receivers == {p_alice.id}


@pytest.mark.asyncio
async def test_trip_service_apply_mutation_and_undo(db_session: AsyncSession):
    trip_id = f"trip_{uuid.uuid4().hex[:8]}"
    initial_itin = {
        "days": [
            {
                "day": 1,
                "itinerary": {
                    "path": [
                        {
                            "stop_id": "stop_init_1",
                            "poi": {"id": "poi1", "name": "Start Place"},
                        }
                    ]
                },
            }
        ]
    }
    trip = TripModel(
        id=trip_id,
        user_id=None,
        destination="Madrid",
        start_date="2026-11-01",
        end_date="2026-11-03",
        itinerary_data=initial_itin,
        revision=0,
    )
    db_session.add(trip)
    await db_session.commit()

    # 1. Apply mutation: Add stop
    def add_op(doc: ItineraryDocument):
        cs, _ = ItineraryEditor.add_stop(
            doc, day=1, poi={"id": "poi2", "name": "Second Place"}
        )
        return cs

    cs = await TripService.apply_mutation(
        trip_id=trip_id,
        mutator_fn=add_op,
        expected_revision=0,
        user=None,
        session=db_session,
        auto_recompute=False,
    )
    assert cs.ok is True
    assert cs.revision == 1

    # Verify trip updated in DB
    trip_check = await TripService.get_trip(trip_id, None, db_session)
    assert trip_check.revision == 1
    assert len(trip_check.itinerary_data["days"][0]["itinerary"]["path"]) == 2

    # 2. Attempt mutation with stale revision (0 instead of 1) -> Must fail
    with pytest.raises(HTTPException) as exc:
        await TripService.apply_mutation(
            trip_id=trip_id,
            mutator_fn=add_op,
            expected_revision=0,
            user=None,
            session=db_session,
            auto_recompute=False,
        )
    assert exc.value.status_code == 409

    # 3. Undo change
    cs_undo = await TripService.undo_last_change(
        trip_id=trip_id, user=None, session=db_session
    )
    assert cs_undo.ok is True
    assert cs_undo.revision == 2

    # Trip itinerary should be restored to initial 1 stop
    trip_after_undo = await TripService.get_trip(trip_id, None, db_session)
    assert len(trip_after_undo.itinerary_data["days"][0]["itinerary"]["path"]) == 1
    assert (
        trip_after_undo.itinerary_data["days"][0]["itinerary"]["path"][0]["stop_id"]
        == "stop_init_1"
    )
