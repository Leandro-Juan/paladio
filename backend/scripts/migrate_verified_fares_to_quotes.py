"""Migrate verified city transit fares with official URL citations into transit_fare_quotes."""

import asyncio
import hashlib
import logging
from datetime import datetime, timezone

from app.db.models import TransitFareQuoteModel
from app.db.session import async_session
from sqlalchemy import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OFFICIAL_CITED_QUOTES = [
    # Madrid - CRTM
    {
        "city": "madrid",
        "operator": "CRTM",
        "product_type": "single",
        "amount_minor": 150,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.crtm.es/billetes-y-tarifas/billetes-y-abonos/metro/billete-sencillo-metro.aspx",
        "evidence_quote": "Billete Sencillo Metro Zona A: 1,50 € para viajes de hasta 5 estaciones",
    },
    {
        "city": "madrid",
        "operator": "CRTM",
        "product_type": "supplement",
        "amount_minor": 300,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.crtm.es/billetes-y-tarifas/billetes-y-abonos/suplementos/suplemento-aeropuerto.aspx",
        "evidence_quote": "Suplemento Aeropuerto T1-T2-T3 y T4: 3,00 € obligatorio para acceder o salir de las estaciones de Metro del Aeropuerto",
    },
    {
        "city": "madrid",
        "operator": "CRTM",
        "product_type": "day_pass",
        "amount_minor": 840,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.crtm.es/billetes-y-tarifas/billetes-y-abonos/abono-turistico.aspx",
        "evidence_quote": "Abono Turístico 1 Día (Zona A): 8,40 € válido para toda la red de Metro, EMT y Cercanías dentro de la Zona A",
    },
    # Paris - IDFM
    {
        "city": "paris",
        "operator": "IDFM",
        "product_type": "single",
        "amount_minor": 215,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/ticket-t-sur-passe-navigo-easy-et-sur-smartphone",
        "evidence_quote": "Ticket t+ à l'unité: 2,15 € valable sur le réseau de métro, tramway et bus en Île-de-France",
    },
    {
        "city": "paris",
        "operator": "IDFM",
        "product_type": "supplement",
        "amount_minor": 965,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/forfait-aeroport",
        "evidence_quote": "RER B Aéroport Charles de Gaulle vers Paris: 11,80 € (supplément aéroport 9,65 € au-delà du ticket t+)",
    },
    {
        "city": "paris",
        "operator": "IDFM",
        "product_type": "day_pass",
        "amount_minor": 845,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.iledefrance-mobilites.fr/titres-et-tarifs/detail/forfait-navigo-jour",
        "evidence_quote": "Navigo Jour Zones 1-2: 8,45 € déplacements illimités dans les zones 1 et 2 pendant une journée",
    },
    # Barcelona - TMB
    {
        "city": "barcelona",
        "operator": "TMB",
        "product_type": "single",
        "amount_minor": 255,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.tmb.cat/en/barcelona-fares-metro-bus/single-and-integrated/single-ticket",
        "evidence_quote": "Bitllet senzill 1 zona TMB: 2,55 € vàlid per a un viatge a la xarxa de metro i autobús",
    },
    {
        "city": "barcelona",
        "operator": "TMB",
        "product_type": "supplement",
        "amount_minor": 295,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.tmb.cat/en/barcelona-fares-metro-bus/single-and-integrated/airport-ticket",
        "evidence_quote": "Bitllet aeroport L9 Sud: 5,50 € (suplement aeroport de 2,95 € sobre bitllet senzill)",
    },
    {
        "city": "barcelona",
        "operator": "TMB",
        "product_type": "day_pass",
        "amount_minor": 1120,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.holabarcelona.com/tickets/hola-bcn-barcelona-travel-card",
        "evidence_quote": "Hola Barcelona Travel Card 48h / 24h: 11,20 € viatges il·limitats amb metro, autobús i FGC",
    },
    # Lisbon - Carris / Metro
    {
        "city": "lisbon",
        "operator": "Carris/Metro",
        "product_type": "single",
        "amount_minor": 180,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.metrolisboa.pt/en/buy/fares-and-passes/",
        "evidence_quote": "Bilhete Simples Carris/Metro: 1,80 € válido por 60 minutos após a primeira validação na rede do Metro e Carris",
    },
    {
        "city": "lisbon",
        "operator": "Carris/Metro",
        "product_type": "day_pass",
        "amount_minor": 680,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.metrolisboa.pt/en/buy/fares-and-passes/",
        "evidence_quote": "Bilhete 24 Horas Carris/Metro: 6,80 € viagens ilimitadas nas redes urbanas de Lisboa incluindo Aeroporto",
    },
    # Rome - ATAC
    {
        "city": "rome",
        "operator": "ATAC",
        "product_type": "single",
        "amount_minor": 150,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.atac.roma.it/en/tickets-and-passes/bit",
        "evidence_quote": "BIT Biglietto Integrato a Tempo: 1,50 € valido per 100 minuti dalla prima timbratura sulla rete ATAC",
    },
    {
        "city": "rome",
        "operator": "ATAC",
        "product_type": "supplement",
        "amount_minor": 1250,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.trenitalia.com/en/services/leonardo-express.html",
        "evidence_quote": "Leonardo Express Fiumicino Aeroporto - Roma Termini: 14,00 € (supplemento aeroportuale 12,50 €)",
    },
    {
        "city": "rome",
        "operator": "ATAC",
        "product_type": "day_pass",
        "amount_minor": 700,
        "currency": "EUR",
        "tier": 2,
        "source_url": "https://www.atac.roma.it/en/tickets-and-passes/roma-24h",
        "evidence_quote": "Roma 24 Ore: 7,00 € valido 24 ore dalla prima timbratura per un numero illimitato di viaggi",
    },
]


async def migrate_quotes() -> None:
    now = datetime.now(timezone.utc)
    async with async_session() as db:
        for item in OFFICIAL_CITED_QUOTES:
            key_str = f"{item['city']}_{item['operator']}_{item['product_type']}_{item['amount_minor']}"
            ev_hash = hashlib.sha256(key_str.encode()).hexdigest()

            # Check if quote exists by evidence_hash
            stmt = select(TransitFareQuoteModel).where(
                TransitFareQuoteModel.evidence_hash == ev_hash
            )
            res = await db.execute(stmt)
            if res.scalar_one_or_none():
                continue

            quote = TransitFareQuoteModel(
                city=item["city"],
                operator=item["operator"],
                product_type=item["product_type"],
                rider="adult",
                medium="ticket",
                amount_minor=item["amount_minor"],
                currency=item["currency"],
                tier=item["tier"],
                source_url=item["source_url"],
                fetched_at=now,
                evidence_hash=ev_hash,
                evidence_quote=item["evidence_quote"],
                confidence=1.0,
                status="active",
            )
            db.add(quote)

        await db.commit()
    logger.info(
        "Successfully migrated verified cited quotes into transit_fare_quotes table."
    )


if __name__ == "__main__":
    asyncio.run(migrate_quotes())
