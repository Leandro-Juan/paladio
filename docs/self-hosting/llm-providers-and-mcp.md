# Configuring LLM providers and MCP clients

Configure any of Paladio's 13 optional generative AI providers inside **Settings** (`/config` under **AI & Swarm Intelligence**) and connect external desktop or CLI agents such as Claude Desktop to Paladio's 82-tool Model Context Protocol (MCP) server.

## Configuring optional chat LLM providers

Generative Large Language Models (LLMs) power only the interactive `Plan -> Agent` conversational assistant (`TripAgentRunner`), never deterministic trip generation or semantic embeddings.

1. Open **Settings** (`/config`) as an administrator and click **AI & LLM Engine**.
2. Choose one of the 13 supported providers: `OpenAI`, `Anthropic (Claude)`, `Google Gemini`, `Groq`, `DeepSeek`, `Mistral AI`, `OpenRouter`, `xAI (Grok)`, `Perplexity`, `Together AI`, `Cerebras`, `Custom OpenAI Compatible / vLLM / LocalAI`, or `Ollama (Local)`.
3. Enter your API key (or base URL for `Custom OpenAI` / `Ollama`) and select or type a model identifier.
4. Click **Test Connection** (`POST /api/system/llm/test`) before saving so Paladio verifies authentication and model availability.

!!! tip "Local Ollama RAM guardrails and unloading"
    For local `Ollama`, `HardwareService` inspects host RAM, CPU cores, and GPU memory to compute safe `num_ctx`, `num_thread`, and `keep_alive` settings automatically. Use **Unload Model** (`POST /api/system/llm/unload`) in `/config` anytime to free VRAM/RAM for Valhalla or large PBF imports.

## Connecting external clients over Streamable HTTP (`/mcp`)

FastMCP mounts on the FastAPI gateway at `POST/GET /mcp` (`mount_mcp_app`), exposing all 82 tools, 6 resources, and 6 prompts to external MCP-capable applications authenticated with a Bearer JWT token.

1. Sign into Paladio or obtain an access token via `POST /api/auth/login`.
2. Point your MCP client to `http://127.0.0.1:8000/mcp` with an `Authorization: Bearer your_jwt_access_token_here` header.
3. Keep connections targeting `localhost` or `127.0.0.1` unless configuring an SSH tunnel or reverse proxy update, because `verify_origin_and_host` rejects untrusted `Host` and `Origin` headers to prevent DNS rebinding attacks.

## Connecting Claude Desktop via `stdio` (`python -m app.mcp`)

For local desktop clients like Claude Desktop that spawn MCP servers over `stdio`, invoke `app.mcp` directly inside the `api` container or your local virtual environment using `PALADIO_API_TOKEN`.

1. Add a shared secret token (`PALADIO_API_TOKEN`) to the `api` service environment in `.env` and restart the container.
2. Add the Paladio server entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paladio": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/path/to/paladio/docker-compose.yml",
        "exec",
        "-T",
        "-e",
        "PALADIO_API_TOKEN=your_paladio_api_token_here",
        "api",
        "python",
        "-m",
        "app.mcp"
      ]
    }
  }
}
```

3. Restart Claude Desktop and verify the `paladio` tools (`get_trip_overview`, `search_pois`, `optimize_day`, `what_if`) and prompts (`review_my_trip`, `rainy_day_plan`) appear in the connector list.

!!! warning "Safe handling of Tier C tools in external MCP clients"
    When an external MCP client invokes a Tier C tool without `confirmed=true` (such as `optimize_trip`, `swap_days`, `remove_day`, `fit_to_budget`, or `delete_ticket`), the tool returns a pending `ProposalData` ID (`paladio:proposal:{id}`, valid for 600s) describing the proposed impact instead of executing immediately.

See [MCP server reference](../reference/mcp-server.md) for the complete catalog of 82 tools, 6 resources, and 6 prompts.
