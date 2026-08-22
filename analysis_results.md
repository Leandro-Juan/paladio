# Paladio Itinerary Test Report: Pipeline Crash Analysis

After running the entire LangGraph pipeline (`test_itinerary.py`) multiple times to trace the crashes under strict real-data enforcement, I have isolated the issues into two primary failure domains: **LLM Structured Output Flakiness** and **Scraper Bot Detection/DOM Instability**.

## 1. Pydantic AI Validator Agent Failures (The Initial Crash)

The initial error you encountered (`❌ Pipeline crashed: Exceeded maximum output retries (3)`) originates from the `validator_node`. 

### The Root Cause
Pydantic AI relies on Ollama (`llama3.1`) to parse the user's natural language request into a strict JSON schema (`TravelConstraints`). Llama 3.1 8B, especially at higher temperatures, occasionally struggles to perfectly adhere to strict formats—particularly the `datetime.date` and `time` requirements inside the `TravelConstraints` schema.
* When the LLM outputs malformed data (e.g., passing `"31st march"` instead of `"YYYY-MM-DD"`, or omitting a mandatory field), Pydantic rejects it. 
* Pydantic AI then automatically retries. If the model fails 3 consecutive times to correct its JSON output, it raises an `UnexpectedModelBehavior` exception which crashes the pipeline before the planner even starts.

> [!TIP]
> **Proposed Fix:** We can add a try/except block around the `validator_agent.run()` call to gracefully handle this limit, or loosen the `TravelConstraints` schema (e.g., using `str` instead of `datetime.date` and parsing it manually downstream).

## 2. Dynamic Scraper Fragility (The Secondary Crash)

After bypassing the LLM flakiness, the pipeline successfully reached the `planner_node` but crashed during the dynamic scraping phase:
`❌ Pipeline crashed: All restaurant scrapers failed for Barcelona. No real restaurant data available.`

### The Root Cause
Because of the strict **"no mock data allowed"** rule, the system attempts a waterfall scraping strategy. However, the Playwright Chromium instances are failing due to two distinct frontend challenges:

1. **Aggressive Bot Protection:** 
   Sites like **Kiwi.com**, **Skyscanner**, and **TripAdvisor** are utilizing advanced CDNs (like Cloudflare or DataDome) that instantly detect the headless Playwright instance. The scripts are blocked before the DOM even loads.
2. **Localized Cookie Consent Banners (Google):** 
   **Google Flights** and **Google Maps** do not block the bot outright, but they display a blocking Cookie Consent banner ("Before you continue to Google"). 
   * We added a script to auto-click the "Accept all" button, but Google often serves this page in random European languages depending on your residential IP's routing (e.g., the test logs showed Dutch: *"Alles accepteren"*). 
   * Since our script specifically looked for English/Spanish text (`/Accept all|Aceptar todo/i`), the click failed, the actual elements (`.pIav2d` or `.Nv2PK`) were never rendered, and the scraper threw a `DOM changed` exception.

> [!WARNING]
> **Proposed Fix:** To ensure real-world data without using paid APIs, we need to implement a more robust Cookie Consent bypass for Google (e.g., using a library like `playwright-stealth` or CSS selectors that target the consent button regardless of language). We may also need to integrate the HTTP scrapers (`VuelingScraper`, `EasyJetScraper`) that were mentioned in a past conversation.

---

I have stopped execution here as requested. We can continue iterating on these specific fixes whenever you are ready!
