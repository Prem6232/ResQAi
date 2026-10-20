import math
from typing import Optional, Dict, Any, List, Tuple
from shapely.geometry import Point, Polygon, shape, mapping
from shapely import wkb, wkt
from geoalchemy2.elements import WKBElement
from app.common.schemas import GeoPoint

def point_to_wkt(lat: float, lng: float, srid: int = 4326) -> str:
    """Format standard WKT string for PostGIS Point."""
    return f"SRID={srid};POINT({lng} {lat})"

def extract_lat_lng(geom: Any) -> Tuple[float, float]:
    """Extract (lat, lng) tuple from WKBElement, EWKT string, WKT string, bytes, or shapely Point."""
    if geom is None:
        return 0.0, 0.0
    if isinstance(geom, Point):
        return float(geom.y), float(geom.x)
    if isinstance(geom, WKBElement):
        try:
            shapely_geom = wkb.loads(bytes(geom.data))
            return float(shapely_geom.y), float(shapely_geom.x)
        except Exception:
            pass
    if isinstance(geom, (bytes, bytearray)):
        try:
            shapely_geom = wkb.loads(bytes(geom))
            return float(shapely_geom.y), float(shapely_geom.x)
        except Exception:
            pass
    if isinstance(geom, str):
        try:
            clean_str = geom.split(";", 1)[1] if ";" in geom else geom
            shapely_geom = wkt.loads(clean_str.strip())
            return float(shapely_geom.y), float(shapely_geom.x)
        except Exception:
            pass
    try:
        from geoalchemy2.shape import to_shape
        p = to_shape(geom)
        return float(p.y), float(p.x)
    except Exception:
        return 0.0, 0.0

def wkb_to_geopoint(wkb_elem: Any, source: str = "gps", accuracy: Optional[float] = None) -> Optional[GeoPoint]:
    """Convert PostGIS Geometry/WKBElement to Pydantic GeoPoint."""
    if wkb_elem is None:
        return None
    try:
        lat, lng = extract_lat_lng(wkb_elem)
        return GeoPoint(
            lat=lat,
            lng=lng,
            accuracyMeters=accuracy,
            source=source
        )
    except Exception:
        return None

def coarsen_coordinates(lat: float, lng: float, grid_size: float = 0.001) -> GeoPoint:
    """
    Coarsen coordinates to a ~100m grid for privacy in public alerts.
    grid_size = 0.001 degrees corresponds to ~111 meters.
    """
    coarsened_lat = round(lat / grid_size) * grid_size
    coarsened_lng = round(lng / grid_size) * grid_size
    return GeoPoint(lat=round(coarsened_lat, 4), lng=round(coarsened_lng, 4), source="simulated")

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters."""
    R = 6371000.0 # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in kilometers."""
    return haversine_distance_meters(lat1, lon1, lat2, lon2) / 1000.0

def geojson_to_wkt_polygon(geojson_geom: Dict[str, Any], srid: int = 4326) -> str:
    """Validate and convert GeoJSON Polygon dict to WKT with SRID."""
    geom = shape(geojson_geom)
    if not isinstance(geom, Polygon):
        raise ValueError("Provided geometry is not a valid Polygon")
    if not geom.is_valid:
        raise ValueError("Polygon has self-intersections or is invalid")
    return f"SRID={srid};{geom.wkt}"

def wkb_to_geojson_polygon(wkb_elem: Any) -> Optional[Dict[str, Any]]:
    """Convert PostGIS WKBElement Polygon to GeoJSON dictionary."""
    if wkb_elem is None:
        return None
    try:
        if isinstance(wkb_elem, WKBElement):
            shapely_geom = wkb.loads(bytes(wkb_elem.data))
        else:
            shapely_geom = wkb.loads(bytes(wkb_elem))
        return mapping(shapely_geom)
    except Exception:
        return None
