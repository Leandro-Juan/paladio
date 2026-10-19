#!/usr/bin/env python3
"""
Secure sovereign CLI tool to reset user passwords.
Can be executed via Docker:
  docker compose exec api python scripts/reset_password.py <username_or_email> [new_password]
Or interactively:
  docker compose exec -it api python scripts/reset_password.py <username_or_email>
"""

import asyncio
import getpass
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.adapters.repositories.sql_user_repository import SqlUserRepository
from app.core.security import hash_password
from app.db.session import async_session


async def reset_password(identifier: str, new_password: str) -> bool:
    if not identifier or not identifier.strip():
        print("Error: Username or email is required.", file=sys.stderr)
        return False

    if not new_password or len(new_password) < 6:
        print("Error: Password must be at least 6 characters long.", file=sys.stderr)
        return False

    async with async_session() as session:
        repo = SqlUserRepository(session)
        user = await repo.get_by_username_or_email(identifier.strip())
        if not user:
            print(
                f"Error: User '{identifier.strip()}' not found in database.",
                file=sys.stderr,
            )
            return False

        hashed = hash_password(new_password)
        updated = await repo.update_password(user.id, hashed)
        if updated:
            print(
                f"SUCCESS: Password updated successfully for user '{user.username}' (id: {user.id})."
            )
            return True
        else:
            print(
                f"Error: Failed to update password for user '{user.username}'.",
                file=sys.stderr,
            )
            return False


def main():
    if len(sys.argv) > 1:
        identifier = sys.argv[1].strip()
    else:
        identifier = input("Enter username or email: ").strip()

    if len(sys.argv) > 2:
        new_password = sys.argv[2]
    elif os.getenv("NEW_PASSWORD"):
        new_password = os.environ["NEW_PASSWORD"]
    else:
        new_password = getpass.getpass("Enter new password: ")
        confirm = getpass.getpass("Confirm new password: ")
        if new_password != confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    success = asyncio.run(reset_password(identifier, new_password))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
