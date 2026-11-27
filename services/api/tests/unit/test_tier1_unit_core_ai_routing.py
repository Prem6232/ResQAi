from datetime import timedelta
import uuid

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.ai.adapters.duplicate_matcher import DuplicateMatcherAdapter
from app.ai.adapters.text_classifier import TextClassifierAdapter
from app.ai.adapters.vision_detector import VisionDetectorAdapter
from app.ai.adapters.voice_transcriber import VoiceTranscriberAdapter
from app.common.spatial import (
    coarsen_coordinates,
    extract_lat_lng,
    geojson_to_wkt_polygon,
    haversine_distance,
    haversine_distance_meters,
    normalize_legacy_coords_to_bhopal,
    point_to_wkt,
)
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    get_password_hash,
    verify_password,
)
from app.models.entities import Incident
from app.routing.engine import OSRMProvider, StraightLineProvider


def _drive_coro(coro):
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


# ---------------------------------------------------------------------------
# 1. Security: Argon2id password hashing & JWT lifecycle
# ---------------------------------------------------------------------------

def test_password_hashing_and_verification():
    hashed = get_password_hash("Bhopal@2026!")
    assert hashed.startswith("$argon2")
    assert verify_password("Bhopal@2026!", hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_access_and_refresh_token_lifecycle():
    user_id = str(uuid.uuid4())
    access_token, access_jti, access_exp_ms = create_access_token(
        {"sub": user_id, "email": "op@bhopal.resqai", "role": "operator"}
    )
    decoded_access = decode_jwt_token(access_token)
    assert decoded_access["sub"] == user_id
    assert decoded_access["email"] == "op@bhopal.resqai"
    assert decoded_access["role"] == "operator"
    assert decoded_access["type"] == "access"
    assert decoded_access["jti"] == access_jti
    assert access_exp_ms > 0

    refresh_token, refresh_jti, _ = create_refresh_token(user_id, "op@bhopal.resqai", "operator")
    decoded_refresh = decode_jwt_token(refresh_token)
    assert decoded_refresh["type"] == "refresh"
    assert decoded_refresh["jti"] == refresh_jti
    assert refresh_jti != access_jti

    expired_token, _, _ = create_access_token(
        {"sub": user_id, "role": "operator"},
        expires_delta=timedelta(minutes=-5),
    )
    with pytest.raises(UnauthorizedError):
        decode_jwt_token(expired_token)

    with pytest.raises(UnauthorizedError):
        decode_jwt_token(access_token + "tampered")


# ---------------------------------------------------------------------------
# 2. Spatial utilities: WKT/WKB extraction, privacy coarsening, Bhopal normalization
# ---------------------------------------------------------------------------

def test_spatial_wkt_wkb_extraction_and_coarsening():
    wkt_str = point_to_wkt(23.2599, 77.4126)
    assert wkt_str == "SRID=4326;POINT(77.4126 23.2599)"
    assert extract_lat_lng(wkt_str) == (23.2599, 77.4126)

    wkb_elem = from_shape(Point(77.4343, 23.2332), srid=4326)
    lat, lng = extract_lat_lng(wkb_elem)
    assert round(lat, 4) == 23.2332
    assert round(lng, 4) == 77.4343

    assert extract_lat_lng(None) == (0.0, 0.0)

    coarsened = coarsen_coordinates(23.25994, 77.41267)
    assert coarsened.lat == 23.26
    assert coarsened.lng == 77.413
    assert coarsened.source == "simulated"


def test_haversine_legacy_normalization_and_polygon_validation():
    assert haversine_distance_meters(23.2599, 77.4126, 23.2599, 77.4126) == 0.0
    km = haversine_distance(23.2599, 77.4126, 23.2332, 77.4343)
    assert 3.0 < km < 4.5

    # Legacy Delhi coordinate translates into Bhopal bounds
    b_lat, b_lng = normalize_legacy_coords_to_bhopal(28.5450, 77.2732)
    assert 23.0 <= b_lat <= 23.5
    assert 77.2 <= b_lng <= 77.7

    # Genuine Bhopal coordinate remains untouched
    assert normalize_legacy_coords_to_bhopal(23.2599, 77.4126) == (23.2599, 77.4126)

    valid_geojson = {
        "type": "Polygon",
        "coordinates": [
            [
                [77.35, 23.18],
                [77.50, 23.18],
                [77.50, 23.32],
                [77.35, 23.32],
                [77.35, 23.18],
            ]
        ],
    }
    wkt_poly = geojson_to_wkt_polygon(valid_geojson)
    assert wkt_poly.startswith("SRID=4326;POLYGON")

    self_intersecting = {
        "type": "Polygon",
        "coordinates": [
            [
                [77.35, 23.18],
                [77.50, 23.32],
                [77.50, 23.18],
                [77.35, 23.32],
                [77.35, 23.18],
            ]
        ],
    }
    with pytest.raises(ValueError):
        geojson_to_wkt_polygon(self_intersecting)


# ---------------------------------------------------------------------------
# 3. Routing Engine: StraightLineProvider & OSRM offline fallback
# ---------------------------------------------------------------------------

def test_routing_straight_line_and_osrm_offline_fallback():
    dist_km, eta_min = StraightLineProvider.calculate(23.2599, 77.4126, 23.2332, 77.4343)
    assert 3.0 < dist_km < 4.5
    assert eta_min == max(1, round((dist_km / 25.0) * 60.0))

    same_dist, same_eta = StraightLineProvider.calculate(23.2599, 77.4126, 23.2599, 77.4126)
    assert same_dist == 0.0
    assert same_eta == 1

    path = StraightLineProvider.calculate_path(23.2599, 77.4126, 23.2332, 77.4343)
    assert path["source"] == "campus_graph"
    assert path["coordinates"] == [[23.2599, 77.4126], [23.2332, 77.4343]]
    assert path["durationMinutes"] >= 1

    # OSRM with empty base_url falls back deterministically without network I/O
    osrm = OSRMProvider(base_url="")
    fallback_path = _drive_coro(osrm.calculate_path(23.2599, 77.4126, 23.2332, 77.4343, profile="driving"))
    assert fallback_path["source"] == "campus_graph"
    assert fallback_path["distanceKm"] == dist_km


# ---------------------------------------------------------------------------
# 4. AI Pipeline Mock & Benchmark Adapters
# ---------------------------------------------------------------------------

def test_text_classifier_adapter_categories_and_fallback():
    clf = TextClassifierAdapter(mode="mock")

    fire = _drive_coro(clf.predict("Dense black smoke and flames near New Market transformer"))
    assert fire.suggestedCategory == "fire_smoke"
    assert fire.suggestedUrgency == "critical"
    assert fire.modelScore >= 0.85

    accident = _drive_coro(clf.predict("Two bikes crashed on VIP Road, traffic blocked"))
    assert accident.suggestedCategory == "road_accident"
    assert accident.suggestedUrgency == "high"

    med = _drive_coro(clf.predict("Student unconscious with severe chest pain ambulance needed"))
    assert med.suggestedCategory == "medical"
    assert med.suggestedUrgency == "critical"

    flood = _drive_coro(clf.predict("Heavy monsoon flooding and waterlogging blocking underpass"))
    assert flood.suggestedCategory == "water_flood"

    safety = _drive_coro(clf.predict("SOS someone is stalking near DB Mall gate at night"))
    assert safety.suggestedCategory == "personal_safety"
    assert safety.suggestedUrgency == "critical"

    unclear = _drive_coro(clf.predict("Broken streetlight outside Hostel Block C"))
    assert unclear.suggestedCategory == "hazard"
    assert unclear.reviewRequired is True


def test_voice_vision_and_duplicate_matcher_adapters():
    voice = _drive_coro(VoiceTranscriberAdapter(mode="live").predict(s3_key="evidence/audio-1.webm"))
    assert voice.confidence == 0.95
    assert "Smoke observed" in voice.transcript

    vision = _drive_coro(VisionDetectorAdapter(mode="mock").predict(s3_key="evidence/fire-1.jpg"))
    assert vision.pipeline == "fire_smoke"
    assert vision.finding == "possible_fire_smoke_evidence"
    assert len(vision.boundingBoxes) == 2
    assert {b.label for b in vision.boundingBoxes} == {"smoke_plume", "active_flame"}

    near_same = Incident(
        id=uuid.uuid4(),
        public_code="402",
        category="fire_smoke",
        urgency="critical",
        status="reported",
        title="Shop fire",
        location=from_shape(Point(77.4127, 23.2600), srid=4326),
        location_label="New Market",
    )
    far_away = Incident(
        id=uuid.uuid4(),
        public_code="409",
        category="fire_smoke",
        urgency="high",
        status="reported",
        title="Distant smoke",
        location=from_shape(Point(77.4600, 23.2200), srid=4326),
        location_label="Habibganj",
    )
    cross_cat = Incident(
        id=uuid.uuid4(),
        public_code="405",
        category="road_accident",
        urgency="high",
        status="reported",
        title="Traffic jam near smoke",
        location=from_shape(Point(77.4130, 23.2601), srid=4326),
        location_label="New Market",
    )

    matcher = DuplicateMatcherAdapter(mode="mock")
    matches = _drive_coro(
        matcher.predict(
            category="fire_smoke",
            lat=23.2599,
            lng=77.4126,
            candidates=[near_same, far_away, cross_cat],
        )
    )
    by_code = {m.incidentId: m for m in matches}
    assert "402" in by_code and by_code["402"].recommendation == "likely_related"
    assert "405" in by_code and by_code["405"].recommendation == "weak" and by_code["405"].score == 0.50
    assert "409" not in by_code
