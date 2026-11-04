"""Pydantic schemas and metadata annotations for MCP tools."""

from typing import Any
from pydantic import BaseModel, Field
import mcp.types as mcp_types


def make_annotations(
    read_only: bool = False,
    destructive: bool = False,
    idempotent: bool = False,
    open_world: bool = False,
) -> mcp_types.ToolAnnotations:
    """Helper to construct honest MCP tool annotations."""
    return mcp_types.ToolAnnotations(
        readOnlyHint=read_only,
        destructiveHint=destructive,
        idempotentHint=idempotent,
        openWorldHint=open_world,
    )


class ProposalData(BaseModel):
    proposal_id: str
    trip_id: str
    tool: str
    summary: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    diff: dict[str, Any] | None = None
    expires_in_seconds: int = 600


class ToolResult(BaseModel):
    ok: bool = True
    summary: str
    data: Any = None
    change_set: dict[str, Any] | None = None
    requires_confirmation: bool = False
    proposal: ProposalData | None = None
    error: str | None = None


class TripOverviewData(BaseModel):
    trip_id: str
    title: str | None = None
    destination: str
    start_date: str | None = None
    end_date: str | None = None
    timezone: str = "UTC"
    status: str = "draft"
    day_count: int
    participant_count: int
    ticket_count: int
    revision: int
    budget_summary: dict[str, Any] = Field(default_factory=dict)
    quality_gates: dict[str, Any] = Field(default_factory=dict)


class TripIssuesData(BaseModel):
    trip_id: str
    total_issues: int
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)
