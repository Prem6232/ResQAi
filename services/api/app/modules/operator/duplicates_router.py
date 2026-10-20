from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.modules.auth.dependencies import require_roles
from app.models.entities import User
from app.modules.operator.schemas import DuplicatePairing
from app.modules.operator.service import get_suspected_duplicates

duplicates_router = APIRouter()

@duplicates_router.get(
    "",
    response_model=List[DuplicatePairing],
    status_code=status.HTTP_200_OK,
    summary="Get suspected duplicate candidate incident pairings"
)
async def list_duplicates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Search active incidents within spatial proximity and return candidate duplicate pairings.
    """
    return await get_suspected_duplicates(db)
