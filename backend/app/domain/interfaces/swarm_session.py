from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class ISwarmSession(ABC):
    @abstractmethod
    async def process_message(
        self, action: str, data: dict, user_msg: str, thread_id: str
    ) -> AsyncGenerator[dict, None]:
        """
        Processes an incoming message and yields Domain Events.
        """
