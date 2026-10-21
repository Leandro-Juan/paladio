"""
Resilient browser profile and proxy pool for flight scraping.
Reads proxy configurations dynamically from environment (FLIGHT_PROXY_URLS, MARKET_PROXY_URLS, LODGING_PROXY_URLS),
manages rate-limiting jitter, and rotates user agents with realistic modern browser headers.
Zero hardcoded proxies or credentials.
"""

import asyncio
import itertools
import os
import random

# Rotating pool of realistic modern browser User-Agents
USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]


class FlightBrowserPool:
    """
    Coordinates outbound scraper requests with proxy rotation, realistic headers,
    and polite concurrency pacing for flight queries.
    """

    def __init__(self):
        raw_proxies = (
            os.environ.get("FLIGHT_PROXY_URLS", "")
            or os.environ.get("MARKET_PROXY_URLS", "")
            or os.environ.get("LODGING_PROXY_URLS", "")
        ).strip()

        if raw_proxies:
            self.proxies = [p.strip() for p in raw_proxies.split(",") if p.strip()]
        else:
            self.proxies = []

        self._proxy_cycle = itertools.cycle(self.proxies) if self.proxies else None
        self._ua_cycle = itertools.cycle(USER_AGENTS)

    @property
    def has_proxies(self) -> bool:
        return bool(self.proxies)

    def get_next_proxy(self) -> str | None:
        """Returns next proxy in round-robin cycle, or None if direct connection."""
        if not self._proxy_cycle:
            return None
        return next(self._proxy_cycle)

    def get_user_agent(self) -> str:
        """Returns randomized user agent."""
        return random.choice(USER_AGENTS)

    def get_headers(
        self, locale: str = "en-US", currency: str = "USD"
    ) -> dict[str, str]:
        """
        Returns realistic HTTP headers to avoid anti-bot fingerprinting.
        """
        ua = self.get_user_agent()
        return {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": f"{locale},{locale[:2]};q=0.9,en;q=0.8",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "sec-ch-ua": '"Google Chrome";v="128", "Chromium";v="128", "Not?A_Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
        }

    async def throttle(self, min_ms: int = 150, max_ms: int = 400) -> None:
        """Introduces non-deterministic polite jitter delay between platform calls."""
        delay = random.uniform(min_ms / 1000.0, max_ms / 1000.0)
        await asyncio.sleep(delay)


# Global singleton instance
flight_browser_pool = FlightBrowserPool()
