# Resilient Scraping Architecture

Paladio operates in a highly adversarial data environment. Traditional web applications fetch data via permissive REST APIs, but the travel industry (flights, hotels, aggregators) aggressively blocks automated traffic using sophisticated bot detection algorithms. 

This document explains Paladio's tiered, resilient scraping architecture, designed to guarantee data retrieval despite these countermeasures.

## The Three-Tier Data Strategy

Paladio attempts to fulfill data requests using a tiered fallback hierarchy. If a preferred layer fails or is blocked, the system transparently degrades to the next available tier without crashing the LangGraph execution flow.

### Tier 1: Local Residential Headful Scrapers (Primary)

The preferred method for data extraction relies on custom dynamic scrapers.

- **Why it's used:** To avoid the exorbitant costs of commercial APIs and to capture the exact UI data a real user would see.
- **The Architecture:** Instead of using datacenter proxies (which are easily blacklisted), the scrapers execute on local hardware via residential network connections.
- **Evasion Tactics:** The scrapers run "headful" (the browser is visibly rendered on the machine rather than headless). This prevents detection from systems like Datadome or Cloudflare that fingerprint headless Chrome instances. We implement human-like interaction patterns (randomized pauses, non-linear cursor movements) to emulate organic traffic on sites like TripAdvisor and Skyscanner.

### Tier 2: Duffel API (Primary Fallback)

If bot detection thresholds tighten and local scrapers fail, Paladio falls back to an integrated commercial provider: the **Duffel API**.

- **Why it's used:** It guarantees real-world flight logistics, schedules, and pricing when dynamic scraping is temporarily unavailable. 
- **Integration Point:** The `planner_node` within the swarm graph attempts the scrape first. If it intercepts a failure or HTTP ban, it seamlessly switches to the Duffel endpoint using configured API credentials.
- **Constraints:** Paladio relies on Duffel specifically to maintain the strict project requirement of utilizing real data (never mock or stub data). 

### Tier 3: Human-in-the-Loop Interrupts (Final Fallback)

If both the headful scrapers and the Duffel API fail, Paladio will **not** silently fail or inject fake placeholders.

- **The Mechanism:** The LangGraph execution triggers an `interrupt()`. 
- **User Experience:** The process pauses, and the system prompts the human operator via the WebSocket interface. The pipeline waits for the operator to either manually provide the required JSON data or bypass the step, ensuring absolute data integrity before passing parameters to the C++ core engine.
