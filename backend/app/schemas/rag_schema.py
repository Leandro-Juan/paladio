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
    tag_affinities: dict[str, float] = Field(
        default_factory=dict,
        description=(
            "Estimated affinity scores between 0.0 and 1.0 for the 8 standard tags based on the user's prompt: "
            "art_culture, history_heritage, nature_outdoors, architecture, food_culinary, nightlife, shopping, scenic_views."
        ),
    )
    cuisine_target_frequency: int = Field(
        default=1,
        description="Suggested number of meals for the preferred cuisine across the trip (e.g., 1-2).",
    )
