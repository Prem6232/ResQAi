import logging
from typing import Any, Dict, List, Optional, Tuple
from app.common.spatial import haversine_distance

logger = logging.getLogger("sentinelgrid.routing")

class StraightLineProvider:
    """
    Straight-line geodesic routing provider fallback.
    Estimates emergency response travel time across campus paths and roads
    assuming an average speed of 25 km/h.
    """
    AVERAGE_CAMPUS_SPEED_KMH = 25.0

    @classmethod
    def calculate(cls, lat1: float, lng1: float, lat2: float, lng2: float) -> Tuple[float, int]:
        """
        Calculate distance in kilometers and estimated travel time in minutes.
        Returns: (distance_km, eta_minutes)
        """
        dist_km = haversine_distance(lat1, lng1, lat2, lng2)
        dist_km = round(dist_km, 2)

        # Calculate ETA minutes, minimum 1 minute if distance > 0
        hours = dist_km / cls.AVERAGE_CAMPUS_SPEED_KMH
        eta_minutes = max(1, round(hours * 60))
        return dist_km, eta_minutes

    @classmethod
    def calculate_path(cls, lat1: float, lng1: float, lat2: float, lng2: float) -> Dict[str, Any]:
        dist_km, eta_minutes = cls.calculate(lat1, lng1, lat2, lng2)
        return {
            "coordinates": [[lat1, lng1], [lat2, lng2]],
            "distanceKm": dist_km,
            "durationMinutes": eta_minutes,
            "source": "campus_graph",
            "liveTraffic": False,
            "guaranteedSafe": False,
        }


class OSRMProvider:
    """
    Open Source Routing Machine (OSRM) driving / foot profile client.
    Falls back gracefully to StraightLineProvider on timeout or connection error.
    """
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or "").rstrip("/")

    async def calculate(self, lat1: float, lng1: float, lat2: float, lng2: float) -> Tuple[float, int]:
        path = await self.calculate_path(lat1, lng1, lat2, lng2, profile="driving")
        return float(path["distanceKm"]), int(path["durationMinutes"])

    async def calculate_path(
        self,
        lat1: float,
        lng1: float,
        lat2: float,
        lng2: float,
        profile: str = "foot",
    ) -> Dict[str, Any]:
        if not self.base_url:
            return StraightLineProvider.calculate_path(lat1, lng1, lat2, lng2)

        safe_profile = profile if profile in ("foot", "driving", "bike") else "foot"
        try:
            import httpx
            url = (
                f"{self.base_url}/route/v1/{safe_profile}/"
                f"{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson"
            )
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    routes = data.get("routes", [])
                    if routes:
                        primary = routes[0]
                        raw_coords: List[List[float]] = (
                            primary.get("geometry", {}).get("coordinates") or []
                        )
                        lat_lng_coords = [[float(pt[1]), float(pt[0])] for pt in raw_coords if len(pt) >= 2]
                        if len(lat_lng_coords) >= 2:
                            dist_km = round(float(primary.get("distance", 0.0)) / 1000.0, 2)
                            eta_minutes = max(1, round(float(primary.get("duration", 0.0)) / 60.0))
                            return {
                                "coordinates": lat_lng_coords,
                                "distanceKm": dist_km,
                                "durationMinutes": eta_minutes,
                                "source": "osrm_baseline",
                                "liveTraffic": False,
                                "guaranteedSafe": False,
                            }
        except Exception as e:
            logger.warning(f"OSRM route lookup failed: {e}. Falling back to StraightLineProvider.")

        return StraightLineProvider.calculate_path(lat1, lng1, lat2, lng2)


# Default router instance
routing_engine = StraightLineProvider()

def calculate_route(lat1: float, lng1: float, lat2: float, lng2: float) -> Tuple[float, int]:
    """Calculate distance in km and ETA in minutes using configured routing engine."""
    return routing_engine.calculate(lat1, lng1, lat2, lng2)
