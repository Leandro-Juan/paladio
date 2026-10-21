import logging
import os

from celery import Celery
from celery.signals import worker_ready
from kombu import Queue

# Use the redis service defined in docker-compose.yml
redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

# Initialize the Celery application
app = Celery("paladio", broker=redis_url, backend=redis_url, include=["app.tasks"])

# Celery Configuration Settings
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_default_queue="celery",
    task_queues=[
        Queue("celery"),
        Queue("transit_build"),
        Queue("poi_hydration"),
    ],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Configure dedicated queues and rate limits to prevent memory exhaustion (Guardrail 4)
    task_routes={
        "app.tasks.build_city_gtfs_task": {"queue": "transit_build"},
        "app.tasks.hydrate_city_pipeline_task": {"queue": "poi_hydration"},
        "app.tasks.ingest_city_pois_task": {"queue": "poi_hydration"},
        "app.tasks.enrich_tier12_city_pois_task": {"queue": "poi_hydration"},
        "app.tasks.enrich_long_tail_city_pois_task": {"queue": "poi_hydration"},
        "app.tasks.reconcile_interrupted_transit_builds": {"queue": "transit_build"},
    },
    task_annotations={
        "app.tasks.build_city_gtfs_task": {
            "acks_late": True,
        },
        "app.tasks.hydrate_city_pipeline_task": {
            "acks_late": True,
        },
    },
    # Configure periodic tasks (Celery Beat)
    beat_schedule={
        "periodic-route-market-scan": {
            "task": "app.tasks.periodic_market_scan_task",
            "schedule": 7200.0,  # every 2 hours
        },
        "periodic-route-baselines-rollup": {
            "task": "app.tasks.periodic_baseline_compute_task",
            "schedule": 86400.0,  # daily
        },
    },
)

logger = logging.getLogger(__name__)


@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """
    Reconciles stale transit compiler distributed locks on worker startup,
    preventing orphaned locks from dead previous worker instances, and
    automatically resumes any transit builds that were interrupted by container shutdown.
    """
    try:
        import redis

        r = redis.from_url(redis_url)
        cleared = r.delete(
            "paladio:transit_compiler_lock", "paladio:transit_compiler_current_city"
        )
        if cleared:
            logger.info("Cleared stale transit compiler locks on worker startup.")
    except Exception as exc:
        logger.warning(f"Could not reconcile transit locks on worker startup: {exc}")

    # Auto-resume interrupted compilation queue
    try:
        from app.tasks import reconcile_interrupted_transit_builds

        reconcile_interrupted_transit_builds.delay()
        logger.info(
            "Dispatched reconcile_interrupted_transit_builds task on worker ready."
        )
    except Exception as rec_err:
        logger.warning(
            f"Could not dispatch reconcile_interrupted_transit_builds on startup: {rec_err}"
        )
