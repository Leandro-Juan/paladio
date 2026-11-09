import logging
from typing import Any

from app.db.models import SystemConfigModel
from app.schemas.settings import DOMAIN_CONFIG_MAP, get_default_domain_config
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class SettingsService:
    @staticmethod
    async def get_domain_settings(session: AsyncSession, domain: str) -> dict[str, Any]:
        """Fetch validated settings for a domain, returning defaults if not yet configured."""
        if domain not in DOMAIN_CONFIG_MAP:
            raise ValueError(f"Unsupported settings domain: '{domain}'")

        schema_cls = DOMAIN_CONFIG_MAP[domain]
        stmt = select(SystemConfigModel).where(SystemConfigModel.key == domain)
        res = await session.execute(stmt)
        record = res.scalar_one_or_none()

        if not record or not record.value:
            defaults = get_default_domain_config(domain)
            return defaults

        # Validate and merge with defaults so newly added fields have safe fallback values
        merged = get_default_domain_config(domain)
        merged.update(record.value)
        validated = schema_cls(**merged).model_dump(mode="json")
        return validated

    @staticmethod
    async def update_domain_settings(
        session: AsyncSession, domain: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Validate and persist domain configuration in the system_config table."""
        if domain not in DOMAIN_CONFIG_MAP:
            raise ValueError(f"Unsupported settings domain: '{domain}'")

        schema_cls = DOMAIN_CONFIG_MAP[domain]

        # Fetch current configuration to allow partial updates
        current = await SettingsService.get_domain_settings(session, domain)
        current.update(payload)

        # Validate with strict Pydantic model
        validated_instance = schema_cls(**current)
        validated_data = validated_instance.model_dump(mode="json")

        stmt = select(SystemConfigModel).where(SystemConfigModel.key == domain)
        res = await session.execute(stmt)
        record = res.scalar_one_or_none()

        if record:
            record.value = validated_data
        else:
            record = SystemConfigModel(key=domain, value=validated_data)
            session.add(record)

        await session.commit()
        await session.refresh(record)
        return validated_data
