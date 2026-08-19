import os
from celery import Celery

# Use the redis service defined in docker-compose.yml
redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

# Initialize the Celery application
app = Celery(
    "paladio",
    broker=redis_url,
    backend=redis_url,
    include=["app.tasks"]
)

# Celery Configuration Settings
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Configure periodic tasks (Celery Beat)
    beat_schedule={
        "scrape-every-5-minutes": {
            "task": "app.tasks.scrape_flight_prices_task",
            # Dispatch task every 300 seconds (5 minutes)
            "schedule": 300.0,
        },
    },
)
