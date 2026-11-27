from datetime import datetime
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.modules.admin.service import get_active_operating_area, get_drill_mode_state
from app.modules.analytics.service import _calc_avg_and_p95, get_analytics_summary


def _drive_coro(coro):
    """Step an async coroutine with pre-resolved AsyncMocks without requiring OS socketpair handles."""
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def test_calc_avg_and_p95_real_samples_and_empty_fallback():
    assert _calc_avg_and_p95([], 0.0, 0.0) == (0.0, 0.0)

    samples = [10.0, 20.0, 30.0, 40.0, 100.0]
    avg_val, p95_val = _calc_avg_and_p95(samples, 0.0, 0.0)
    assert avg_val == 40.0
    assert p95_val == 100.0


def test_drill_mode_falls_back_to_latest_audit_log_when_redis_unavailable():
    mock_redis = MagicMock()
    mock_redis.get = AsyncMock(side_effect=ConnectionError("Redis offline"))

    fake_audit = MagicMock()
    fake_audit.details = {"drill_mode": False}
    fake_result = MagicMock()
    fake_result.scalar_one_or_none.return_value = fake_audit

    fake_session = MagicMock()
    fake_session.execute = AsyncMock(return_value=fake_result)

    with patch("app.modules.admin.service.get_redis_client", return_value=mock_redis):
        state = _drive_coro(get_drill_mode_state(fake_session))

    assert state is False


def test_empty_operating_area_initializes_bhopal_metro_grid():
    empty_result = MagicMock()
    empty_result.scalar_one_or_none.return_value = None

    fake_session = MagicMock()
    fake_session.execute = AsyncMock(return_value=empty_result)
    fake_session.add = MagicMock()

    async def fake_refresh(obj):
        obj.id = uuid.uuid4()
        obj.created_at = datetime.utcnow()

    fake_session.commit = AsyncMock()
    fake_session.refresh = AsyncMock(side_effect=fake_refresh)

    area = _drive_coro(get_active_operating_area(fake_session))

    assert area.name == "Bhopal Metropolitan Safety Grid"
    assert area.srid == 4326
    assert len(area.polygon) == 5
    # Verify coordinates are inside Bhopal (not Delhi 28.54)
    for lng, lat in area.polygon:
        assert 23.0 <= lat <= 24.0
        assert 77.0 <= lng <= 78.0


def test_analytics_summary_counts_assigned_and_en_route_statuses():
    executed_sql = []

    async def fake_execute(stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        executed_sql.append(compiled)
        res = MagicMock()
        res.scalar.return_value = 3
        res.scalars.return_value.all.return_value = []
        return res

    fake_session = MagicMock()
    fake_session.execute = AsyncMock(side_effect=fake_execute)

    with patch("app.modules.analytics.service.get_drill_mode_state", AsyncMock(return_value=False)):
        summary = _drive_coro(get_analytics_summary(fake_session))

    assert summary.synthetic_drill_mode is False
    active_query = executed_sql[1]
    assert "'assigned'" in active_query
    assert "'en_route'" in active_query
    assert "'dispatched'" not in active_query
