# Optional AI Travel Assistant (`Plan -> Agent`)

Chat with the optional Paladio Travel Assistant inside `Plan -> Agent` to query nearby venues, diagnose schedule issues, dry-run changes, or propose multi-stop edits with explicit confirmation cards, countdown timers, and one-click revision undo.

## Deterministic planning versus optional chat LLMs

Paladio never hands arithmetic, distance matrices, or combinatorial ordering to a generative Large Language Model (LLM). Instead, `TripAgentRunner` (`pydantic-ai`) acts as a conversational orchestrator over the same deterministic `FastMCP` tools (`paladio_core`, Valhalla, GTFS, PostgreSQL) that power the rest of the workspace.

- If you run Paladio solely for automated trip creation, booking scanning, route monitoring, and manual Speed Dial editing, you do not need to configure any LLM provider.
- When you configure one or more LLM providers in **Settings** (`/config` under **AI & LLM Engine**), `Plan -> Agent` streams answers over `WS /api/ws/trip-agent/{trip_id}` and hot-switches models anytime from the header `ModelSelectorPopover`.

## Supported LLM providers and viewport context

The assistant header displays your active model pill and a removable `ContextChip` summarizing what you are currently viewing in `/trips/[id]`.

- **13 supported providers**: `OpenAI`, `Anthropic (Claude)`, `Google Gemini`, `Groq`, `DeepSeek`, `Mistral AI`, `OpenRouter`, `xAI (Grok)`, `Perplexity`, `Together AI`, `Cerebras`, `Custom OpenAI Compatible / vLLM / LocalAI`, and local `Ollama` (guarded by `HardwareService` RAM checks).
- **UI viewport awareness**: Each chat turn can pass your active tab, selected day, selected stop ID, destination, and current map bounding box (`ui_context`) so prompts like `Find a quiet lunch near what I am looking at` resolve against your exact screen state.
- **Dynamic toolset loading**: Every turn starts with 21 core read/edit tools and dynamically loads specialized domain toolsets (`expenses`, `tickets`, `transit`, `collab`, `collections`, `market`, `jobs`, `engine`, `itinerary_advanced`) based on prompt keywords or the `load_toolset` tool.

## Confirmation safeguards, expiry timers, and instant Undo

Every mutation performed by the assistant creates an immutable snapshot in `trip_revisions` and logs SHA-256-hashed tool arguments in `agent_actions`, while high-impact ("Tier C") edits always pause for explicit approval before modifying your trip.

| Safeguard layer | Triggered when | What you see in the UI |
| :--- | :--- | :--- |
| **Read-only & dry-run tools** | Queries (`get_trip_issues`, `search_pois`, `what_if`, `compare_metrics`) | Executes immediately; displays live tool status pills and inline POI result cards |
| **Tier W routine writes** | Low-risk edits (adding an unlocked stop, setting stop notes, updating preferences) | Executes immediately, writes a `trip_revisions` snapshot, and pops a 10s `ChangeToast` with an **Undo** button |
| **Tier C confirmation gate** | High-impact or destructive tools (`remove_stop` on locked/anchor stops, `swap_days`, `remove_day`, `optimize_trip`, `rebalance_days`, `fit_to_budget`, `delete_ticket`, `delete_expense`, `remove_participant`, `change_hotel_anchor`, `update_trip_details` for destination/dates, `export_trip_package` shareable) | Pauses on a **CONFIRMATION REQUIRED** `ProposalCard` showing an itemized JSON diff preview, countdown timer (`600s` backend Redis TTL; `300s` fallback timer if omitted), and **Reject** / **Approve Change** buttons |

Follow these steps to work safely with the assistant:

1. Open `/trips/[id]`, select **Plan -> Agent**, and verify your preferred model pill (or click it to switch via `ModelSelectorPopover`).
2. Ask a question or request a schedule change (for example, `What issues does Day 2 have?` or `Rebalance stops so Day 3 has less walking`).
3. Review any **CONFIRMATION REQUIRED** `ProposalCard` diff carefully before clicking **Approve Change** or **Reject**.
4. Click **Undo** on the post-mutation `ChangeToast` (or ask the agent to `undo_last_change`) if you want to revert immediately, or click **Clear Chat History** to reset the Redis conversation buffer (`paladio:agent:session:{trip_id}:{user_id}`).
