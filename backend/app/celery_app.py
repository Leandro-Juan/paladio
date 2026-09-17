import os

from celery import Celery
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
    ],
    # Configure dedicated queues and rate limits to prevent memory exhaustion (Guardrail 4)
    task_routes={
        "app.tasks.build_city_gtfs_task": {"queue": "transit_build"},
    },
    task_annotations={
        "app.tasks.build_city_gtfs_task": {"rate_limit": "1/m"},
    },
    # Configure periodic tasks (Celery Beat)
    beat_schedule={},
)
