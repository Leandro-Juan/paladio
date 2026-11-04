"""Per-request context, database session, and access verification for MCP."""

import os
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request
from mcp.server.fastmcp import Context

from app.core.access import TripAccessLevel, assert_trip_access
from app.db.models import UserModel
from app.db.session import async_session
from app.mcp.auth import (
    resolve_user_from_jwt,
    resolve_user_from_stdio_token,
    verify_origin_and_host,
)


@dataclass
class UserContext:
    user: UserModel | None
    session: AsyncSession
    auth_mode: str = "jwt"  # "jwt", "stdio", "in_process"
    client_ip: str | None = None
    _owns_session: bool = False

    async def check_access(
        self, trip_id: str, level: TripAccessLevel = TripAccessLevel.READ
    ) -> None:
        """Helper to assert access on this user context."""
        await assert_trip_access(self.user, trip_id, level, self.session)

    async def close(self) -> None:
        """Close session if owned by this context."""
        if self._owns_session and self.session is not None:
            await self.session.close()


current_user_context: ContextVar[UserContext | None] = ContextVar(
    "current_user_context", default=None
)


@asynccontextmanager
async def with_user_context(
    user: UserModel | None,
    session: AsyncSession,
    auth_mode: str = "in_process",
    client_ip: str | None = None,
) -> AsyncGenerator[UserContext, None]:
    """Context manager for setting the active UserContext in-process or in background tasks."""
    ctx = UserContext(
        user=user,
        session=session,
        auth_mode=auth_mode,
        client_ip=client_ip,
        _owns_session=False,
    )
    token = current_user_context.set(ctx)
    try:
        yield ctx
    finally:
        current_user_context.reset(token)


async def get_user_context(ctx: Context | None = None) -> UserContext:
    """
    Resolves the active UserContext.
    Checks:
    1. Active ContextVar (in-process calls, websocket agents, or background tasks)
    2. HTTP Request headers from ctx.request_context.request
    3. stdio PALADIO_API_TOKEN environment variable
    """
    var_ctx = current_user_context.get()
    if var_ctx is not None:
        return var_ctx

    # Attempt to extract from MCP request context if available
    req: Request | None = None
    if ctx is not None:
        try:
            req_ctx = getattr(ctx, "request_context", None)
            if req_ctx is not None:
                req = getattr(req_ctx, "request", None)
        except Exception:
            req = None

    if req is not None:
        if not verify_origin_and_host(req):
            raise PermissionError("Forbidden: Host or Origin header validation failed")

        auth_header = req.headers.get("authorization", "")
        token = ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()

        if not token:
            raise PermissionError("Authentication required: Bearer JWT token missing")

        session = async_session()
        user = await resolve_user_from_jwt(token, session)
        if not user:
            await session.close()
            raise PermissionError("Invalid or expired authentication token")

        client_host = req.client.host if req.client else None
        return UserContext(
            user=user,
            session=session,
            auth_mode="jwt",
            client_ip=client_host,
            _owns_session=True,
        )

    # Stdio mode fallback
    stdio_token = os.getenv("PALADIO_API_TOKEN")
    if stdio_token:
        session = async_session()
        user = await resolve_user_from_stdio_token(stdio_token, session)
        if not user:
            await session.close()
            raise PermissionError("Invalid PALADIO_API_TOKEN")

        return UserContext(
            user=user,
            session=session,
            auth_mode="stdio",
            client_ip="127.0.0.1",
            _owns_session=True,
        )

    raise PermissionError(
        "Authentication required: no active user context or credential found"
    )
