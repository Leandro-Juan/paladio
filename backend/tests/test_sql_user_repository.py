import pytest
from app.adapters.repositories.sql_user_repository import (
    ALLOWED_USER_ADMIN_UPDATE_FIELDS,
    SqlUserRepository,
)


@pytest.mark.asyncio
async def test_user_repository_admin_update_allowlist(db_session):
    assert "role" in ALLOWED_USER_ADMIN_UPDATE_FIELDS
    assert "preferences" in ALLOWED_USER_ADMIN_UPDATE_FIELDS
    assert "hashed_password" not in ALLOWED_USER_ADMIN_UPDATE_FIELDS

    repo = SqlUserRepository(db_session)
    user = await repo.create_user(
        user_id="user-allowlist-test",
        email="allowlist@paladio.internal",
        username="allowlist_user",
        hashed_password="hashed_pw_123",
        role="user",
    )
    assert user.id == "user-allowlist-test"

    # Attempt mass-assignment of restricted/internal fields and valid fields
    updates = {
        "id": "hacked-id",
        "created_at": None,
        "hashed_password": "overwritten-password",
        "role": "admin",
        "is_active": False,
        "username": "updated_username",
        "email": "updated_email@paladio.internal",
        "preferences": {"theme": "dark"},
    }

    updated = await repo.update_user_admin("user-allowlist-test", updates)
    assert updated is not None

    # Restricted fields must NOT be modified
    assert updated.id == "user-allowlist-test"
    assert updated.hashed_password == "hashed_pw_123"

    # Allowed fields must be modified
    assert updated.role == "admin"
    assert updated.is_active is False
    assert updated.username == "updated_username"
    assert updated.email == "updated_email@paladio.internal"
    assert updated.preferences == {"theme": "dark"}


@pytest.mark.asyncio
async def test_user_repository_scoped_session_execution(db_session):
    # Verify SqlUserRepository works seamlessly with session_factory context
    from app.db.session import async_session

    scoped_repo = SqlUserRepository(session_factory=async_session)
    user = await scoped_repo.get_by_id("non-existent-user-id")
    assert user is None


@pytest.mark.asyncio
async def test_user_repository_save_embedding_768d_validation(db_session):
    repo = SqlUserRepository(db_session)
    user = await repo.create_user(
        user_id="user-emb-dim-test",
        email="embdim@paladio.internal",
        username="embdim_user",
        hashed_password="hashed_pw_123",
        role="user",
    )
    assert user.id == "user-emb-dim-test"

    # Reject 8D tag affinities vector
    with pytest.raises(ValueError) as exc_info:
        await repo.save_embedding("user-emb-dim-test", [0.5] * 8)
    assert "Expected 768D embedding vector, got 8D" in str(exc_info.value)

    # Reject 16D vector
    with pytest.raises(ValueError) as exc_info:
        await repo.save_embedding("user-emb-dim-test", [0.1] * 16)
    assert "Expected 768D embedding vector, got 16D" in str(exc_info.value)

    # Reject None
    with pytest.raises(ValueError):
        await repo.save_embedding("user-emb-dim-test", None)


@pytest.mark.asyncio
async def test_user_repository_save_embedding_768d_success(db_session):
    repo = SqlUserRepository(db_session)
    user = await repo.create_user(
        user_id="user-emb-768-success",
        email="emb768@paladio.internal",
        username="emb768_user",
        hashed_password="hashed_pw_123",
        role="user",
    )
    assert user.id == "user-emb-768-success"

    valid_768 = [0.01 * (i % 10) for i in range(768)]
    await repo.save_embedding("user-emb-768-success", valid_768)

    retrieved = await repo.get_embedding("user-emb-768-success")
    assert retrieved is not None
    assert len(retrieved) == 768
    assert pytest.approx(retrieved[0]) == valid_768[0]
    assert pytest.approx(retrieved[767]) == valid_768[767]
