import asyncio

from mcp import ClientSession
from mcp.client.sse import sse_client


async def main():
    print("Connecting to PriceWin MCP server...")
    try:
        async with sse_client("https://mcp.price.win/mcp") as (
            read_stream,
            write_stream,
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                print("Initialized. Searching for flights MAD to BCN on 2026-10-15...")

                # 1. Start the live search
                result = await session.call_tool(
                    "search_flights_live",
                    arguments={
                        "origin": "MAD",
                        "destination": "BCN",
                        "departureDate": "2026-10-15",
                        "adults": 1,
                    },
                )

                # The result is a list of CallToolResult objects, usually with text content
                session_id = None
                for content in result.content:
                    if content.type == "text":
                        import json

                        data = json.loads(content.text)
                        session_id = data.get("sessionId")
                        print(f"Search started! Session ID: {session_id}")

                if not session_id:
                    print("Failed to get session ID")
                    return

                # 2. Poll for results (skill says it blocks internally up to ~30s)
                print("Polling for results (this may take up to 30s)...")
                poll_result = await session.call_tool(
                    "poll_flight_results", arguments={"sessionId": session_id}
                )

                for content in poll_result.content:
                    if content.type == "text":
                        data = json.loads(content.text)
                        print(f"Status: {data.get('status')}")
                        flights = data.get("outboundFlights", [])
                        print(f"Found {len(flights)} flights!")
                        if flights:
                            best = flights[0]
                            print(
                                f"Cheapest flight: {best.get('airline')} - {best.get('price')} {best.get('currency')}"
                            )
                            print(
                                f"Departure: {best.get('departure', {}).get('time')} -> Arrival: {best.get('arrival', {}).get('time')}"
                            )

    except Exception as e:
        print(f"Failed to call MCP: {e}")


if __name__ == "__main__":
    asyncio.run(main())
