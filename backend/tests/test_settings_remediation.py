import tempfile
import uuid
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest
from sqlalchemy import delete

from app.core.security import create_access_token
from app.db.models import SystemConfigModel, UserModel
from app.engine.scoring.features import TAG_KEYS
from app.engine.scoring.semantic_learning import SemanticLearningEngine
from app.services.settings_service import SettingsService
from app.swarm.agents.ticket_parser import ticket_parser_node
from app.swarm.critic import CriticIssueType, planner_critic_node
from app.swarm.nodes.constraint_builder import assemble_constraints_node
from app.swarm.repair import planner_repair_node
from app.trip_package import TripUnpacker


async def _create_user_headers(db_session, role: str) -> tuple[str, dict[str, str]]:
    uid = str(uuid.uuid4())
    user = UserModel(
        id=uid,
        email=f"remediation_{role}_{uid[:8]}@example.com",
        username=f"remediation_{role}_{uid[:8]}",
        hashed_password="fakehashedpwd",
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    token = create_access_token(subject=uid, extra_claims={"role": role})
    return uid, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_taste_profile_lifecycle_and_reset(async_client, db_session, monkeypatch):
    # Deterministic orthogonal 8-channel anchors embedded in 768 dimensions (fast, zero network/ONNX I/O)
    anchors: dict[str, list[float]] = {}
    for idx, tag in enumerate(TAG_KEYS):
        vec = np.zeros(768, dtype=np.float32)
        vec[idx] = 1.0
        anchors[tag] = vec.tolist()

    monkeypatch.setattr(
        "app.api.system._load_taste_anchors",
        AsyncMock(return_value=anchors),
    )

    # 1. Anonymous caller gets inactive neutral state
    anon_res = await async_client.get("/api/system/taste-profile")
    assert anon_res.status_code == 200
    assert anon_res.json()["active"] is False
    assert anon_res.json()["affinities"] == []

    anon_reset = await async_client.post("/api/system/taste-profile/reset")
    assert anon_reset.status_code == 401

    # 2. Authenticated user with non-neutral learned vector gets live 8-D projections
    user_id, user_headers = await _create_user_headers(db_session, "user")
    from app.adapters.repositories.sql_user_repository import SqlUserRepository

    learned = np.zeros(768, dtype=np.float32)
    learned[TAG_KEYS.index("food_culinary")] = 0.9
    learned[TAG_KEYS.index("history_heritage")] = 0.4
    learned = (learned / np.linalg.norm(learned)).tolist()

    repo = SqlUserRepository(db_session)
    await repo.save_embedding(user_id, learned)

    profile_res = await async_client.get(
        "/api/system/taste-profile", headers=user_headers
    )
    assert profile_res.status_code == 200
    body = profile_res.json()
    assert body["active"] is True
    assert body["dimensions"] == 768
    categories = {item["category"]: item["score"] for item in body["affinities"]}
    assert categories["Food & Culinary"] > categories["Nightlife"]

    # 3. Reset restores neutral 768-D prior and deactivates learned projection
    reset_res = await async_client.post(
        "/api/system/taste-profile/reset", headers=user_headers
    )
    assert reset_res.status_code == 200
    assert reset_res.json()["active"] is False

    stored = await repo.get_embedding(user_id)
    neutral = SemanticLearningEngine.get_neutral_768d_prior(768)
    assert np.allclose(np.asarray(stored), np.asarray(neutral), atol=1e-4)

    after_reset = await async_client.get(
        "/api/system/taste-profile", headers=user_headers
    )
    assert after_reset.status_code == 200
    assert after_reset.json()["active"] is False


@pytest.mark.asyncio
async def test_admin_only_system_actions(async_client, db_session, monkeypatch):
    await db_session.execute(
        delete(SystemConfigModel).where(
            SystemConfigModel.key.in_(["engine_runtime", "vault_snapshots"])
        )
    )
    await db_session.commit()

    _, user_headers = await _create_user_headers(db_session, "user")
    _, admin_headers = await _create_user_headers(db_session, "admin")

    mock_delay = MagicMock()
    monkeypatch.setattr("app.tasks.daily_flight_sweep_task.delay", mock_delay)

    for path in (
        "/api/system/deals/sweep",
        "/api/system/vault/snapshot",
        "/api/system/cache/purge",
    ):
        unauth = await async_client.post(path)
        assert unauth.status_code == 403
        non_admin = await async_client.post(path, headers=user_headers)
        assert non_admin.status_code == 403

    sweep_res = await async_client.post(
        "/api/system/deals/sweep", headers=admin_headers
    )
    assert sweep_res.status_code == 200
    assert sweep_res.json()["status"] == "success"
    assert sweep_res.json()["triggered_at"]
    mock_delay.assert_called_once()

    snap_res = await async_client.post(
        "/api/system/vault/snapshot", headers=admin_headers
    )
    assert snap_res.status_code == 200
    assert snap_res.json()["status"] == "success"
    assert set(snap_res.json()["domains_archived"]) >= {
        "engine",
        "swarm",
        "vault",
        "notifications",
    }

    purge_res = await async_client.post(
        "/api/system/cache/purge", headers=admin_headers
    )
    assert purge_res.status_code == 200
    assert purge_res.json()["purged"] is True
    assert isinstance(purge_res.json()["keys_cleared"], int)


@pytest.mark.asyncio
async def test_swarm_nodes_consume_engine_and_swarm_settings(db_session):
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key.in_(["engine", "swarm"]))
    )
    await db_session.commit()

    await SettingsService.update_domain_settings(
        db_session,
        "engine",
        {
            "pacing_tempo": "intense",
            "attraction_burnout_limit": 2,
            "meal_windows": {"breakfast": 30, "lunch": 90, "dinner": 105},
        },
    )
    await SettingsService.update_domain_settings(
        db_session,
        "swarm",
        {
            "critic_strictness": 0.9,
            "auto_ticket_ingestion": False,
            "require_human_approval_on_repair": True,
        },
    )

    # 1. constraint_builder consumes pacing_tempo and meal_windows minutes
    built = await assemble_constraints_node(
        {
            "manual_constraints": {
                "budget_usd": 1200.0,
                "meals": ["BREAKFAST", "LUNCH", "DINNER"],
                "destination_city": "Kyoto",
            }
        }
    )
    validated = built["validated_itinerary"]
    assert validated["pace"] == "intense"
    meals_by_type = {m["meal_type"]: m for m in validated["meals"]}
    assert meals_by_type["BREAKFAST"]["start_time"] == "08:00:00"
    assert meals_by_type["BREAKFAST"]["end_time"] == "08:30:00"
    assert meals_by_type["LUNCH"]["start_time"] == "12:00:00"
    assert meals_by_type["LUNCH"]["end_time"] == "13:30:00"
    assert meals_by_type["DINNER"]["start_time"] == "19:30:00"
    assert meals_by_type["DINNER"]["end_time"] == "21:15:00"

    # 2. planner_critic_node consumes attraction_burnout_limit (=2) and critic_strictness (=0.9)
    three_sights = [
        {
            "poi": {
                "poi_id": f"s{i}",
                "name": f"Museum {i}",
                "category": "museum",
                "lat": 35.0 + i * 0.001,
                "lon": 135.7,
                "duration_mins": 60,
            }
        }
        for i in range(3)
    ]
    critic_out = await planner_critic_node(
        {
            "validated_itinerary": validated,
            "final_itinerary": {
                "days": [
                    {
                        "day_number": 1,
                        "itinerary": {"path": three_sights, "total_travel_mins": 10},
                    },
                    {
                        "day_number": 2,
                        "itinerary": {"path": three_sights, "total_travel_mins": 10},
                    },
                ]
            },
        },
        {},
    )
    overloaded = [
        issue
        for issue in critic_out["critic_issues"]
        if issue["issue_type"] == CriticIssueType.DAY_OVERLOADED.value
    ]
    assert len(overloaded) == 2
    # strictness 0.9 scales base penalty 2*2.0*50=200 by (0.9/0.75)=1.2 -> 240; 6*100 - 0*1.5 - 240 = 360.0
    assert critic_out["current_objective_j"] == 360.0

    # 3. planner_repair_node propagates require_human_approval_on_repair
    repair_out = await planner_repair_node(
        {
            "daily_pois_data": [three_sights],
            "critic_issues": [],
            "refinement_iteration": 0,
        },
        {},
    )
    assert repair_out["requires_human_approval"] is True

    # 4. ticket_parser_node skips automatic parsing when auto_ticket_ingestion is False
    skipped = await ticket_parser_node(
        {
            "booking_text": "Flight AF123 JFK -> CDG on 2026-08-01",
            "booking_anchors": {"preserved": True},
        }
    )
    assert skipped["booking_anchors"] == {"preserved": True}


@pytest.mark.asyncio
async def test_trip_export_honors_vault_anonymization_setting(
    async_client, db_session, monkeypatch
):
    await db_session.execute(
        delete(SystemConfigModel).where(SystemConfigModel.key == "vault")
    )
    await db_session.commit()

    async def mock_walking(*args, **kwargs):
        return None

    async def mock_async_noop(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "app.services.transit_service.ensure_walking_legs_populated", mock_walking
    )
    monkeypatch.setattr(
        "app.tasks.async_trigger_city_gtfs_download_if_needed", mock_async_noop
    )
    monkeypatch.setattr("app.engine.city_readiness.ensure_city_ready", mock_async_noop)

    _, user_headers = await _create_user_headers(db_session, "user")
    create_res = await async_client.post(
        "/api/trips/",
        json={
            "destination": "Lisbon, Portugal",
            "start_date": "2026-10-10",
            "end_date": "2026-10-12",
            "itinerary_data": {"days": []},
        },
        headers=user_headers,
    )
    assert create_res.status_code == 201
    trip_id = create_res.json()["id"]

    await SettingsService.update_domain_settings(
        db_session, "vault", {"export_anonymized_trips": True}
    )

    export_res = await async_client.get(
        f"/api/trips/{trip_id}/export", headers=user_headers
    )
    assert export_res.status_code == 200

    with tempfile.NamedTemporaryFile(suffix=".trip", delete=False) as tf:
        tf.write(export_res.content)
        tmp_path = tf.name

    try:
        manifest = TripUnpacker(tmp_path).inspect_manifest()
        assert manifest.export_profile == "community_shareable"
    finally:
        import os

        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
