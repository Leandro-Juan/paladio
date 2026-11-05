# How-To: Connect Claude Desktop or Cursor to Paladio MCP

Paladio includes a standard Model Context Protocol (MCP) server that can be attached to desktop AI clients such as **Claude Desktop**, **Cursor**, or the **MCP Inspector**.

---

## 1. Prerequisites

1. Paladio backend running locally or accessible via Docker.
2. PostgreSQL and Redis running.
3. A registered Paladio user account and valid JWT or user ID.

---

## 2. Option A: Standard I/O (stdio) Transport

Claude Desktop supports launching local subprocesses via `stdio`.

Edit your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the `paladio` server entry:

```json
{
  "mcpServers": {
    "paladio": {
      "command": "/home/leandro/Code/Projects/Paladio/.venv/bin/python",
      "args": ["-m", "app.mcp.server"],
      "cwd": "/home/leandro/Code/Projects/Paladio/backend",
      "env": {
        "PYTHONPATH": "/home/leandro/Code/Projects/Paladio/backend",
        "DATABASE_URL": "postgresql+asyncpg://paladio:paladio@localhost:5432/paladio",
        "REDIS_URL": "redis://localhost:6379/0"
      }
    }
  }
}
```

Restart Claude Desktop. The hammer icon in the prompt input will now display all **77 Paladio tools**.

---

## 3. Option B: Network HTTP/SSE Transport

When Paladio's FastAPI backend is running (`uvicorn app.main:app`), the MCP server is mounted at:
```
http://127.0.0.1:8000/mcp/sse
```

### Testing with the MCP Inspector
To interactively inspect and test tools without Claude Desktop:
```bash
npx @modelcontextprotocol/inspector http://127.0.0.1:8000/mcp/sse
```

---

## 4. Example Prompts in Claude Desktop

Once connected, you can prompt Claude:
- *"List the stops on Day 1 for trip 8d62dfec-..."*
- *"Optimize Day 2 for minimum walking distance and open hours."*
- *"Simulate what happens if we remove stop stop_123 from Day 1."*
- *"Who owes what for dinner? Show our settlement breakdown."*

Tier C tools (such as `clear_day` or `rebalance_days`) will return an interactive proposal requiring you to confirm before changes are committed.
