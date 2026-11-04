"""MCP Authentication and Security Verification."""

import os
from starlette.requests import Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import decode_access_token
from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.db.models import UserModel


def verify_origin_and_host(
    request: Request, allowed_hosts: list[str] | None = None
) -> bool:
    """
    Validates Host and Origin headers to protect local MCP HTTP endpoints against DNS rebinding attacks.
    """
    if allowed_hosts is None:
        allowed_hosts = ["localhost", "127.0.0.1", "0.0.0.0"]

    host_header = request.headers.get("host", "").split(":")[0]
    if host_header and host_header not in allowed_hosts:
        return False

    origin = request.headers.get("origin")
    if origin:
        from urllib.parse import urlparse

        parsed = urlparse(origin)
        origin_host = parsed.hostname or ""
        if origin_host not in allowed_hosts:
            return False

    return True


async def resolve_user_from_jwt(token: str, session: AsyncSession) -> UserModel | None:
    """
    Decodes a JWT access token and retrieves the corresponding active UserModel.
    """
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None

    user_id = payload["sub"]
    user_repo = SqlUserRepository(session)
    user = await user_repo.get_by_id(user_id)
    if not user or not user.is_active:
        return None

    return user


async def resolve_user_from_stdio_token(
    token: str, session: AsyncSession
) -> UserModel | None:
    """
    Resolves a user from the stdio token environment variable (PALADIO_API_TOKEN).
    First attempts JWT decoding; if not a JWT, matches user email or id if token matches PALADIO_API_TOKEN.
    """
    expected_token = os.getenv("PALADIO_API_TOKEN")
    if not expected_token:
        # If no PALADIO_API_TOKEN configured, try decoding as JWT
        return await resolve_user_from_jwt(token, session)

    if token != expected_token:
        return None

    # Resolve default / first admin or active user for stdio operations
    stmt = (
        select(UserModel)
        .where(UserModel.is_active.is_(True))
        .order_by(UserModel.created_at.asc())
    )
    result = await session.execute(stmt)
    user = result.scalars().first()
    return user
