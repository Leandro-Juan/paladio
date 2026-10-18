/**
 * Headless Playwright scraper for Booking.com search results.
 * Called as a subprocess by BookingScraperProvider with (city, checkin, checkout, adults).
 * Outputs JSON array of authentic scraped hotel offers.
 */

const { chromium } = require('/home/leandro/Code/Projects/Paladio/frontend/node_modules/playwright');

async function main() {
  const city = process.argv[2] || 'Rome';
  const checkin = process.argv[3] || '2026-11-18';
  const checkout = process.argv[4] || '2026-11-22';
  const adults = process.argv[5] || '2';

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&no_rooms=1&selected_currency=EUR`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3500);

    const cards = await page.$$eval('[data-testid="property-card"]', els => {
      return els.slice(0, 10).map(el => {
        const titleEl = el.querySelector('[data-testid="title"]');
        const priceEl = el.querySelector('[data-testid="price-and-discounted-price"]');
        const scoreEl = el.querySelector('[data-testid="review-score"]');
        const linkEl = el.querySelector('a[data-testid="title-link"]') || el.querySelector('a');
        
        const title = titleEl ? titleEl.innerText.trim() : null;
        const priceText = priceEl ? priceEl.innerText.trim() : null;
        let scoreVal = null;
        let reviewCount = null;
        
        if (scoreEl) {
          const text = scoreEl.innerText;
          const match = text.match(/(\d+[,\.]\d+)/);
          if (match) {
            scoreVal = parseFloat(match[1].replace(',', '.'));
          }
          const cntMatch = text.match(/([\d\.]+)\s+beoordelingen|reviews|opiniones/i);
          if (cntMatch) {
            reviewCount = parseInt(cntMatch[1].replace(/\./g, ''), 10);
          }
        }

        return {
          title,
          priceText,
          score: scoreVal,
          reviewCount,
          link: linkEl ? linkEl.href : null
        };
      });
    });

    console.log(JSON.stringify({ status: 'ok', offers: cards }));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
