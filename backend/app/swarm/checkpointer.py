from langgraph.checkpoint.memory import MemorySaver

# For Phase 2, we use MemorySaver for local thread persistence and human-in-the-loop.
# This will be migrated to AsyncpgSaver as we scale in Phase 3.
memory = MemorySaver()
