import asyncio
import os
os.environ["OLLAMA_BASE_URL"] = "http://localhost:11435"
from app.swarm.agents.validator import validator_agent

async def main():
    res = await validator_agent.run("Context: \n\nUser Request: Plan a 5-day trip to barcelona starting tomorrow with a budget of 2500. i want to visit the sagrada familia")
    print(res.output)

asyncio.run(main())
