from app.modules.citizen.router import router as citizen_router
from app.modules.citizen.contacts_router import contacts_router
from app.modules.citizen.alerts_router import alerts_router

__all__ = ["citizen_router", "contacts_router", "alerts_router"]
