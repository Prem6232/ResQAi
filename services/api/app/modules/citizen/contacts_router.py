from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.models.entities import User
from app.modules.citizen.schemas import (
    TrustedContactCreate,
    TrustedContactResponse,
)
from app.modules.citizen.service import (
    get_user_contacts,
    add_user_contact,
    delete_user_contact,
)

contacts_router = APIRouter()

@contacts_router.get(
    "",
    response_model=List[TrustedContactResponse],
    status_code=status.HTTP_200_OK,
    summary="List trusted emergency contacts"
)
async def list_contacts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return caller's trusted emergency contacts (up to 3)."""
    return await get_user_contacts(db, current_user.id)

@contacts_router.post(
    "",
    response_model=TrustedContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new trusted emergency contact"
)
async def create_contact(
    payload: TrustedContactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Add a trusted emergency contact. Fails with HTTP 400 if user already has 3 contacts.
    """
    return await add_user_contact(db, current_user.id, payload)

@contacts_router.delete(
    "/{id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a trusted emergency contact"
)
async def delete_contact(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a trusted contact by ID."""
    return await delete_user_contact(db, current_user.id, id)
