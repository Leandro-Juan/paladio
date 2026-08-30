import asyncio
import logging
from pprint import pprint

from app.swarm.agents.validator import validator_node

# Enable logging to see the phase markers
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


async def test():
    try:
        print("\n" + "=" * 50)
        print("DEBUGGING TEST: VALIDATOR NODE")
        print("=" * 50)

        # mock a state with a single message
        from langchain_core.messages import HumanMessage

        state = {
            "messages": [
                HumanMessage(
                    content="I want to plan a 3-day trip to Madrid visiting museums and eating tapas."
                )
            ],
            "retrieved_context": "Museums are generally closed on Mondays. Avoid scheduling museums then.",
        }

        print("\n[PHASE START] Running validator_node with state:")
        pprint(state)

        res = await validator_node(state)

        print("\n[PHASE COMPLETE] Output from validator_node:")
        pprint(res)
        print("=" * 50 + "\n")

    except Exception as e:
        print("ERROR:", type(e), e)
        # print pydantic_ai specific validation error details
        if hasattr(e, "errors"):
            print(e.errors())


if __name__ == "__main__":
    asyncio.run(test())
