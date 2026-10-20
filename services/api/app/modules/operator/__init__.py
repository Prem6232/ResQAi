from app.modules.operator.router import router as operator_router
from app.modules.operator.actions_router import actions_router
from app.modules.operator.settings_router import settings_router
from app.modules.operator.duplicates_router import duplicates_router

__all__ = [
    "operator_router",
    "actions_router",
    "settings_router",
    "duplicates_router",
]
