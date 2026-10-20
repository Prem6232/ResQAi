import logging
from typing import Tuple, Optional
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

class OSRMProvider:
    """
    Open Source Routing Machine (OSRM) driving / foot profile client.
    Falls back gracefully to StraightLineProvider on timeout or connection error.
    """
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url

    async def calculate(self, lat1: float, lng1: float, lat2: float, lng2: float) -> Tuple[float, int]:
        if not self.base_url:
            return StraightLineProvider.calculate(lat1, lng1, lat2, lng2)

        try:
            import httpx
            url = f"{self.base_url}/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=false"
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    routes = data.get("routes", [])
                    if routes:
                        primary = routes[0]
                        dist_km = round(primary.get("distance", 0.0) / 1000.0, 2)
                        eta_minutes = max(1, round(primary.get("duration", 0.0) / 60.0))
                        return dist_km, eta_minutes
        except Exception as e:
            logger.warning(f"OSRM route lookup failed: {e}. Falling back to StraightLineProvider.")

        return StraightLineProvider.calculate(lat1, lng1, lat2, lng2)

# Default router instance
routing_engine = StraightLineProvider()

def calculate_route(lat1: float, lng1: float, lat2: float, lng2: float) -> Tuple[float, int]:
    """Calculate distance in km and ETA in minutes using configured routing engine."""
    return routing_engine.calculate(lat1, lng1, lat2, lng2)
