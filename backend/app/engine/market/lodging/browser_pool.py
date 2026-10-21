"""
Resilient browser and proxy pool for lodging scraping.
Reads proxy configurations dynamically from environment (LODGING_PROXY_URLS),
manages rate-limiting jitter, and rotates user agents.
Zero hardcoded proxies.
"""

import asyncio
import itertools
import os
import random

# Rotating pool of realistic browser User-Agents
USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
]


class LodgingBrowserPool:
    """
    Coordinates outbound scraper requests with proxy rotation and polite concurrency pacing.
    """

    def __init__(self):
        raw_proxies = os.environ.get("LODGING_PROXY_URLS", "").strip()
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

    async def throttle(self, min_ms: int = 150, max_ms: int = 400) -> None:
        """Introduces non-deterministic polite jitter delay between platform calls."""
        delay = random.uniform(min_ms / 1000.0, max_ms / 1000.0)
        await asyncio.sleep(delay)


# Global singleton instance
browser_pool = LodgingBrowserPool()
