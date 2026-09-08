from pydantic import BaseModel, Field


class RAGPromptAnalysis(BaseModel):
    mandatory_pois: list[str] = Field(
        default_factory=list,
        description="Explicitly requested mandatory landmarks or places to visit.",
    )
    preferred_cuisines: list[str] = Field(
        default_factory=list,
        description="Specific cuisines or food types the user enjoys (e.g., ['indian']).",
    )
    travel_tastes: list[str] = Field(
        default_factory=list,
        description="General trip interests, themes, or activity styles (e.g., ['bar', 'cultural', 'art', 'relaxed']).",
    )
    cuisine_target_frequency: int = Field(
        default=1,
        description="Suggested number of meals for the preferred cuisine across the trip (e.g., 1-2).",
    )
