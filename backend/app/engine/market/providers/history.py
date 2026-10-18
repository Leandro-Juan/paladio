"""
History provider (Tier 3).
Queries own real historical observations in database.
Quotes have is_live=False and can NEVER trigger deals; used solely for baseline computation and fallback display.
"""

from datetime import date
from app.db.models import LodgingOfferModel
from app.engine.market.ports import LodgingQuote
from app.engine.market.providers.base import BaseQuoteProvider, NoDataError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class HistoryQuoteProvider(BaseQuoteProvider):
    """
    Tier 3 / Fallback history provider reading strictly from our own past real ticks.
    Guaranteed is_live=False.
    """

    def __init__(self, asset_type: str):
        super().__init__(
            name=f"history_{asset_type}", asset_type=asset_type, cloud=False
        )

    async def is_healthy(self) -> bool:
        return True

    async def fetch_destination_summary(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        session: AsyncSession,
    ) -> LodgingQuote:
        dest_upper = destination_code.upper()
        # Find latest real lodging offer for this city/destination
        stmt = (
            select(LodgingOfferModel)
            .where(LodgingOfferModel.destination_code == dest_upper)
            .order_by(LodgingOfferModel.observed_at.desc())
            .limit(1)
        )
        res = await session.execute(stmt)
        offer = res.scalar_one_or_none()
        if not offer:
            raise NoDataError(
                f"No historical lodging records exist in database for {dest_upper}"
            )

        nightly_cents = int(
            round(
                offer.price_total_cents
                / max((offer.check_out - offer.check_in).days, 1)
            )
        )

        return LodgingQuote(
            destination_code=dest_upper,
            check_in=check_in,
            check_out=check_out,
            base_price_per_night_cents=nightly_cents,
            currency=offer.currency,
            quality_score=offer.review_score * 10.0 if offer.review_score else None,
            property_name=offer.name,
            property_id=offer.property_id,
            stars=offer.stars,
            review_score=offer.review_score,
            review_count=offer.review_count,
            latitude=offer.latitude,
            longitude=offer.longitude,
            taxes_included=offer.taxes_included,
            estimated_fee_ratio=None,
            deep_link=offer.deep_link,
            source="history_db",
            observed_at=offer.observed_at,
            is_live=False,
            confidence="low",
        )

    async def search_offers(
        self,
        destination_code: str,
        check_in: date,
        check_out: date,
        adults: int = 2,
        session: AsyncSession = None,
    ) -> list[LodgingQuote]:
        dest_upper = destination_code.upper()
        stmt = (
            select(LodgingOfferModel)
            .where(LodgingOfferModel.destination_code == dest_upper)
            .order_by(LodgingOfferModel.observed_at.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        offers = res.scalars().all()
        if not offers:
            raise NoDataError(f"No historical lodging offers exist for {dest_upper}")

        quotes = []
        for o in offers:
            nightly = int(
                round(o.price_total_cents / max((o.check_out - o.check_in).days, 1))
            )
            quotes.append(
                LodgingQuote(
                    destination_code=dest_upper,
                    check_in=check_in,
                    check_out=check_out,
                    base_price_per_night_cents=nightly,
                    currency=o.currency,
                    quality_score=o.review_score * 10.0 if o.review_score else None,
                    property_name=o.name,
                    property_id=o.property_id,
                    stars=o.stars,
                    review_score=o.review_score,
                    review_count=o.review_count,
                    latitude=o.latitude,
                    longitude=o.longitude,
                    taxes_included=o.taxes_included,
                    estimated_fee_ratio=None,
                    deep_link=o.deep_link,
                    source="history_db",
                    observed_at=o.observed_at,
                    is_live=False,
                    confidence="low",
                )
            )
        return quotes
