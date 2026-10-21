/**
 * Headless Playwright scraper for Booking.com search results.
 * Called as a subprocess by BookingScraperProvider with (city, checkin, checkout, adults, [offset], [stars], [proxy]).
 * Outputs JSON array of authentic scraped hotel offers without hardcoded limits.
 */

const path = require('path');
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e1) {
  try {
    const frontendPlaywright = path.resolve(__dirname, '../../../../../frontend/node_modules/playwright');
    chromium = require(frontendPlaywright).chromium;
  } catch (e2) {
    try {
      chromium = require('playwright-core').chromium;
    } catch (e3) {
      console.error(JSON.stringify({ status: 'error', message: 'No playwright chromium available' }));
      process.exit(1);
    }
  }
}

async function main() {
  const city = process.argv[2] || 'Rome';
  const checkin = process.argv[3] || '2026-11-18';
  const checkout = process.argv[4] || '2026-11-22';
  const adults = process.argv[5] || '2';
  const offset = process.argv[6] || '0';
  const stars = process.argv[7] || '';
  const proxyUrl = process.argv[8] || process.env.HTTP_PROXY || process.env.http_proxy || '';

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  };

  if (proxyUrl) {
    launchOptions.proxy = { server: proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  let url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&no_rooms=1&selected_currency=EUR&offset=${offset}`;
  if (stars) {
    url += `&nflt=class%3D${stars}`;
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Quick scroll to trigger lazy loading of cards
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(1500);

    const cards = await page.$$eval('[data-testid="property-card"]', els => {
      return els.map(el => {
        const titleEl = el.querySelector('[data-testid="title"]');
        const priceEl = el.querySelector('[data-testid="price-and-discounted-price"]');
        const scoreEl = el.querySelector('[data-testid="review-score"]');
        const linkEl = el.querySelector('a[data-testid="title-link"]') || el.querySelector('a');
        const starEl = el.querySelector('[data-testid="rating-stars"]') || el.querySelector('[data-testid="rating-squares"]');

        const title = titleEl ? titleEl.innerText.trim() : null;
        const priceText = priceEl ? priceEl.innerText.trim() : null;
        let scoreVal = null;
        let reviewCount = null;
        let starCount = null;

        if (scoreEl) {
          const text = scoreEl.innerText;
          const match = text.match(/(\d+[,\.]\d+)/);
          if (match) {
            scoreVal = parseFloat(match[1].replace(',', '.'));
          }
          const cntMatch = text.match(/([\d\.]+)\s*(?:beoordelingen|reviews|opiniones|avis)/i);
          if (cntMatch) {
            reviewCount = parseInt(cntMatch[1].replace(/\./g, ''), 10);
          }
        }

        if (starEl) {
          const aria = starEl.getAttribute('aria-label') || '';
          const m = aria.match(/(\d)/);
          if (m) {
            starCount = parseInt(m[1], 10);
          } else {
            // Count child icons
            const svgs = starEl.querySelectorAll('span, svg');
            if (svgs.length > 0) {
              starCount = svgs.length;
            }
          }
        }

        const link = linkEl ? linkEl.href : null;
        let propertyId = null;
        if (link) {
          const m = link.match(/\/hotel\/[a-z]{2}\/([^.?]+)/i);
          if (m) {
            propertyId = m[1];
          }
        }
        if (!propertyId && el.getAttribute('data-hotelid')) {
          propertyId = el.getAttribute('data-hotelid');
        }

        return {
          title,
          propertyId,
          priceText,
          score: scoreVal,
          reviewCount,
          stars: starCount,
          link
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
