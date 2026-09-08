import asyncio
from playwright.async_api import async_playwright


class BrowserPool:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self._lock = asyncio.Lock()

    async def get_context(self):
        async with self._lock:
            if not self.playwright:
                self.playwright = await async_playwright().start()
            if not self.browser:
                self.browser = await self.playwright.chromium.launch(headless=True)
        return await self.browser.new_context()

    async def close(self):
        async with self._lock:
            if self.browser:
                await self.browser.close()
                self.browser = None
            if self.playwright:
                await self.playwright.stop()
                self.playwright = None


pool = BrowserPool()
