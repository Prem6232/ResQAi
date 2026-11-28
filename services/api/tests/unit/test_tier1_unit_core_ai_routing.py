from datetime import timedelta
import asyncio
from pathlib import Path
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


def test_text_classifier_adapter_live_muril_onnx_and_fallback(monkeypatch):
    onnx_dir = Path(__file__).resolve().parents[4] / "ml" / "text_classifier" / "artifacts" / "onnx"
    assert (onnx_dir / "model_fp32.onnx").is_file(), f"Missing trained ONNX model at {onnx_dir}"

    clf = TextClassifierAdapter(mode="live")

    async def _run_cases():
        fire = await clf.predict("MP Nagar transformer mein aag aur dhuwa nikal raha hai")
        crash = await clf.predict("रेलवे स्टेशन के बाहर तेज रफ्तार कार ने दोपहिया को टक्कर मार दी दो लोग घायल हैं")
        med = await clf.predict("Katara Hills park mein daudte waqt buzurg ko chest pain aur chakkar aa ke gir gaye")
        safety = await clf.predict("raat ke 11 baje Narela mod pe do ladke bike se peecha kar rahe dar lag raha help")
        flood = await clf.predict("Habibganj underpass mein kamar tak baarish ka paani bhar gaya ek car andar doob rahi hai")
        slang = await clf.predict("Aaj ke match mein Sharma ji ne batting se aag laga di stadium mein")
        return fire, crash, med, safety, flood, slang

    fire, crash, med, safety, flood, slang = asyncio.run(_run_cases())

    for res in (fire, crash, med, safety, flood, slang):
        assert res.modelVersion.startswith("muril-indian-emergency-v1-onnx")
        assert 0.0 <= res.modelScore <= 1.0

    assert fire.suggestedCategory == "fire_smoke"
    assert crash.suggestedCategory == "road_accident"
    assert med.suggestedCategory == "medical"
    assert safety.suggestedCategory == "personal_safety"
    assert flood.suggestedCategory == "water_flood"
    assert slang.suggestedCategory == "other"

    # Missing ONNX path falls back cleanly to deterministic mock inference
    from app.core.config import settings
    monkeypatch.setattr(settings, "TEXT_CLASSIFIER_MODEL_DIR", str(onnx_dir / "nonexistent_subdir"))
    fallback = asyncio.run(clf.predict("Dense black smoke near New Market transformer"))
    assert fallback.suggestedCategory == "fire_smoke"
    assert fallback.modelVersion == "distilbert-emergency-v1-mock"


def test_voice_transcriber_live_whisper_and_chained_classifier(monkeypatch):
    repo_root = Path(__file__).resolve().parents[4]
    whisper_dir = repo_root / "ml" / "voice_transcriber" / "artifacts" / "whisper-small-ct2"
    memo_wav = repo_root / "ml" / "voice_transcriber" / "datasets" / "raw" / "emergency_memos" / "memo_fire_01.wav"
    assert (whisper_dir / "model.bin").is_file(), f"Missing Faster-Whisper model in {whisper_dir}"
    assert memo_wav.is_file(), f"Missing sample WAV in {memo_wav}"

    wav_bytes = memo_wav.read_bytes()
    vt = VoiceTranscriberAdapter(mode="live")
    clf = TextClassifierAdapter(mode="live")

    async def _run_voice_to_classifier():
        v_direct = await vt.predict(file_bytes=wav_bytes)
        t_res = await clf.predict(v_direct.transcript)

        import app.ai.adapters.voice_transcriber as vt_mod
        monkeypatch.setattr(vt_mod, "_fetch_s3_audio_bytes", lambda key: wav_bytes)
        v_s3 = await vt.predict(s3_key="evidence/memo_fire_01.wav")
        return v_direct, t_res, v_s3

    v_direct, t_res, v_s3 = asyncio.run(_run_voice_to_classifier())

    assert v_direct.modelVersion.startswith("faster-whisper-small-ct2")
    assert "smoke" in v_direct.transcript.lower() or "transformer" in v_direct.transcript.lower()
    assert 0.05 <= v_direct.confidence <= 0.99
    assert v_direct.detectedLanguage.startswith("en-IN")
    assert t_res.suggestedCategory == "fire_smoke"
    assert v_s3.transcript == v_direct.transcript

    # Missing Whisper path falls back cleanly to mock without crashing
    from app.core.config import settings
    monkeypatch.setattr(settings, "VOICE_TRANSCRIBER_MODEL_DIR", str(whisper_dir / "nonexistent_subdir"))
    fallback = asyncio.run(vt.predict(file_bytes=wav_bytes))
    assert fallback.modelVersion == "faster-whisper-medium-mock"


def test_duplicate_matcher_live_e5_onnx_and_fallback(monkeypatch):
    from shapely.geometry import Point

    onnx_dir = Path(__file__).resolve().parents[4] / "ml" / "duplicate_matcher" / "artifacts" / "onnx"
    assert (onnx_dir / "model_int8.onnx").is_file(), f"Missing trained E5 ONNX model at {onnx_dir}"

    matcher = DuplicateMatcherAdapter(mode="live")

    class FakeCandidate:
        def __init__(self, code, cat, loc, title):
            self.public_code = code
            self.category = cat
            self.location = loc
            self.title = title

    cands = [
        # True Hinglish -> English duplicate ~50m away
        FakeCandidate(
            "DUP-H2E",
            "fire_smoke",
            Point(77.4342, 23.2317),
            "E-rickshaw battery explosion fire and dense smoke reported at Chuna Bhatti crossing",
        ),
        # True Hindi (Devanagari) -> English cross-category mistagged duplicate ~78m away
        FakeCandidate(
            "DUP-HI-MISTAG",
            "hazard",
            Point(77.4344, 23.2319),
            "Heavy continuous rainfall submerged culvert underpass stranding multiple vehicles",
        ),
        # Same-place hard negative ~24m away: DIFFERENT real emergency at exact same spot!
        FakeCandidate(
            "NEG-SAME-PLACE",
            "road_accident",
            Point(77.4341, 23.2315),
            "Chuna Bhatti square par bike phisal gayi rider ke pair mein chot lagi hai",
        ),
        # Out-of-radius > 300m
        FakeCandidate(
            "FAR-OUT",
            "fire_smoke",
            Point(77.4500, 23.2500),
            "Chuna Bhatti square pe e-rickshaw mein battery blast hoke aag fail gayi",
        ),
    ]

    async def _run():
        res_fire = await matcher.predict(
            category="fire_smoke",
            text="Chuna Bhatti square pe e-rickshaw mein battery blast hoke aag aur dhuwa fail gaya",
            lat=23.2313,
            lng=77.4340,
            candidates=cands,
        )
        res_flood = await matcher.predict(
            category="water_flood",
            text="लगातार बारिश से अंडरपास में पानी भर गया है और कई गाड़ियां फंस गई हैं",
            lat=23.2313,
            lng=77.4340,
            candidates=cands,
        )
        return res_fire, res_flood

    res_fire, res_flood = asyncio.run(_run())
    fire_by_code = {r.incidentId: r for r in res_fire}
    flood_by_code = {r.incidentId: r for r in res_flood}

    assert "FAR-OUT" not in fire_by_code
    assert fire_by_code["DUP-H2E"].recommendation == "likely_related"
    assert fire_by_code["DUP-H2E"].score > fire_by_code["NEG-SAME-PLACE"].score
    assert fire_by_code["NEG-SAME-PLACE"].recommendation == "weak"
    assert any("e5-small-indian-duplicate-v1-onnx" in s for s in fire_by_code["DUP-H2E"].signals)

    assert flood_by_code["DUP-HI-MISTAG"].recommendation in ("likely_related", "review")
    assert flood_by_code["DUP-HI-MISTAG"].score > flood_by_code["NEG-SAME-PLACE"].score
    assert any("e5-small-indian-duplicate-v1-onnx" in s for s in flood_by_code["DUP-HI-MISTAG"].signals)

    # Missing ONNX path falls back cleanly to heuristic without crashing
    from app.core.config import settings
    monkeypatch.setattr(settings, "DUPLICATE_MATCHER_MODEL_DIR", str(onnx_dir / "nonexistent_subdir"))
    fallback = asyncio.run(
        matcher.predict(
            category="fire_smoke",
            text="Chuna Bhatti square fire",
            lat=23.2313,
            lng=77.4340,
            candidates=cands[:1],
        )
    )
    assert len(fallback) == 1
    assert fallback[0].incidentId == "DUP-H2E"
    assert fallback[0].recommendation == "likely_related"


def test_vision_detector_live_fcos_onnx_and_fallback(monkeypatch):
    repo_root = Path(__file__).resolve().parents[4]
    onnx_dir = repo_root / "ml" / "vision_detector" / "artifacts" / "onnx"
    pos_img = repo_root / "ml" / "vision_detector" / "datasets" / "raw" / "images" / "test_dfire_ood" / "test-00002-of-00003_00056_WEB10428.jpg"
    neg_img = repo_root / "ml" / "vision_detector" / "datasets" / "raw" / "images" / "test_indian_neg" / "img_0903.jpg"
    assert (onnx_dir / "model_fp32.onnx").is_file(), f"Missing trained ONNX model in {onnx_dir}"
    assert pos_img.is_file() and neg_img.is_file(), "Missing OOD sample test images"

    pos_bytes = pos_img.read_bytes()
    neg_bytes = neg_img.read_bytes()
    vd = VisionDetectorAdapter(mode="live")

    async def _run():
        res_pos = await vd.predict(file_bytes=pos_bytes)
        res_neg = await vd.predict(file_bytes=neg_bytes)

        import app.ai.adapters.vision_detector as vd_mod
        monkeypatch.setattr(vd_mod, "_fetch_s3_image_bytes", lambda key: pos_bytes)
        res_s3 = await vd.predict(s3_key="evidence/fire_ood.jpg")
        return res_pos, res_neg, res_s3

    res_pos, res_neg, res_s3 = asyncio.run(_run())

    assert res_pos.pipeline == "fire_smoke"
    assert res_pos.finding == "possible_fire_smoke_evidence"
    assert res_pos.adapter == "live_model"
    assert res_pos.modelVersion.startswith("fcos-r50-fpn-indian-fire-smoke-v1-onnx")
    assert res_pos.modelScore >= 0.50
    labels = {b.label for b in res_pos.boundingBoxes}
    assert {"smoke_plume", "active_flame"}.issubset(labels)
    for b in res_pos.boundingBoxes:
        assert 0.0 <= b.x <= 1.0 and 0.0 <= b.y <= 1.0
        assert 0.0 < b.width <= 1.0 and 0.0 < b.height <= 1.0

    assert res_neg.finding == "no_supported_visual_evidence"
    assert res_neg.adapter == "live_model"
    assert res_neg.boundingBoxes == []
    assert res_s3.finding == res_pos.finding and res_s3.modelScore == res_pos.modelScore

    # Missing ONNX path falls back cleanly to mock without crashing
    from app.core.config import settings
    monkeypatch.setattr(settings, "VISION_DETECTOR_MODEL_DIR", str(onnx_dir / "nonexistent_subdir"))
    fallback = asyncio.run(vd.predict(file_bytes=pos_bytes))
    assert fallback.modelVersion == "yolov8-fire-smoke-v2-mock"
    assert fallback.adapter == "labelled_demo_adapter"
