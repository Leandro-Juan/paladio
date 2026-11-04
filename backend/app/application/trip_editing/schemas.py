from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class Change(BaseModel):
    model_config = ConfigDict(extra="allow")

    kind: str
    day: int
    stop_id: Optional[str] = None
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None


class ChangeWarning(BaseModel):
    model_config = ConfigDict(extra="allow")

    code: str
    severity: str = "warning"
    message: str
    stop_id: Optional[str] = None
    day: Optional[int] = None


class QualityDelta(BaseModel):
    model_config = ConfigDict(extra="allow")

    score_before: Optional[float] = None
    score_after: Optional[float] = None
    gates_passed: bool = True
    details: Optional[dict[str, Any]] = None


class ChangeSet(BaseModel):
    model_config = ConfigDict(extra="allow")

    ok: bool = True
    summary: str
    revision: int = 0
    changes: list[Change] = Field(default_factory=list)
    warnings: list[ChangeWarning] = Field(default_factory=list)
    quality: Optional[QualityDelta] = None
    undo_token: Optional[str] = None
    document: Optional[Any] = None

    def __iter__(self):
        yield self
        yield self.document
