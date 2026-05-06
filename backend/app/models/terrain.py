from dataclasses import dataclass
from typing import Optional, List, Dict, Literal
from pydantic import BaseModel, Field, field_validator

Bucket = Literal["paved", "dirt", "unknown"]


class TerrainRun(BaseModel):
    """Contiguous stretch of route with a single terrain bucket (mobile UI / polyline coloring)."""

    start_index: int = Field(..., ge=0, description="Start vertex index on decoded polyline")
    end_index: int = Field(..., ge=0, description="End vertex index (inclusive)")
    bucket: Bucket
    distance_m: float = Field(..., ge=0, description="Length along route for this run, meters")


@dataclass
class TerrainQuery:
    """Data class for terrain query parameters."""
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    polyline: Optional[str] = None
    distance_threshold: float = 25.0

    def __post_init__(self):
        """Validate coordinates after initialization."""
        self._validate_coordinates()

    def _validate_coordinates(self):
        """Validate that coordinates are within valid ranges."""
        if not (-90 <= self.start_lat <= 90):
            raise ValueError(f"Invalid start_lat: {self.start_lat}")
        if not (-90 <= self.end_lat <= 90):
            raise ValueError(f"Invalid end_lat: {self.end_lat}")
        if not (-180 <= self.start_lon <= 180):
            raise ValueError(f"Invalid start_lon: {self.start_lon}")
        if not (-180 <= self.end_lon <= 180):
            raise ValueError(f"Invalid end_lon: {self.end_lon}")

class TerrainInfo(BaseModel):
    """Model for terrain information response."""
    surfaces: List[str] = Field(default_factory=list)
    tracktypes: List[str] = Field(default_factory=list)
    highways: List[str] = Field(default_factory=list)
    surface_distances: Dict[str, float] = Field(default_factory=dict)
    natural_percentage: float = 0.0
    total_distance: float = 0.0
    matched_distance: float = 0.0
    unmatched_distance: float = 0.0
    runs: List[TerrainRun] = Field(
        default_factory=list,
        description="Ordered contiguous terrain buckets along the polyline for coloring / breakdown UI",
    )

    @field_validator('natural_percentage')
    @classmethod
    def validate_percentage(cls, v):
        """Validate that percentage is between 0 and 100."""
        if not 0 <= v <= 100:
            raise ValueError('natural_percentage must be between 0 and 100')
        return v

class TerrainRequest(BaseModel):
    """Model for terrain info request."""
    start_lat: float = Field(..., ge=-90, le=90)
    start_lon: float = Field(..., ge=-180, le=180)
    end_lat: float = Field(..., ge=-90, le=90)
    end_lon: float = Field(..., ge=-180, le=180)
    polyline: Optional[str] = None
    distance_threshold: float = Field(default=25.0, gt=0)

    def to_terrain_query(self) -> TerrainQuery:
        """Convert to TerrainQuery instance."""
        return TerrainQuery(
            start_lat=self.start_lat,
            start_lon=self.start_lon,
            end_lat=self.end_lat,
            end_lon=self.end_lon,
            polyline=self.polyline,
            distance_threshold=self.distance_threshold
        ) 
