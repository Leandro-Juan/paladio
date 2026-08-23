import pytest
import logging
from unittest.mock import patch
from app.tasks import scrape_static_task

logger = logging.getLogger(__name__)

def test_celery_task():
    logger.info("Testing static task imports...")
    assert scrape_static_task is not None
    logger.info("Imports and static test succeeded.")
