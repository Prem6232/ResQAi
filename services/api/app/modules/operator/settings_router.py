from fastapi import APIRouter, Depends, status

from app.modules.auth.dependencies import require_roles
from app.models.entities import User
from app.modules.operator.schemas import OperatorSettingsSchema
from app.modules.operator.service import get_operator_settings, update_operator_settings

settings_router = APIRouter()

@settings_router.get(
    "",
    response_model=OperatorSettingsSchema,
    status_code=status.HTTP_200_OK,
    summary="Get operator triage and command preferences"
)
async def read_settings(
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """Return operator threshold settings, clustering radii, and audio preferences."""
    return get_operator_settings()

@settings_router.put(
    "",
    response_model=OperatorSettingsSchema,
    status_code=status.HTTP_200_OK,
    summary="Update operator triage and command preferences"
)
async def modify_settings(
    payload: OperatorSettingsSchema,
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """Update operator clustering radii and alert preferences."""
    return update_operator_settings(payload)
