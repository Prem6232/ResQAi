from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import logging

logger = logging.getLogger("sentinelgrid.exceptions")

from typing import Optional, Union

class AppException(Exception):
    def __init__(
        self,
        arg1: Union[str, int] = "ERROR",
        arg2: Optional[str] = None,
        arg3: Optional[Union[str, int]] = None,
        code: Optional[str] = None,
        message: Optional[str] = None,
        status_code: Optional[int] = None,
    ):
        if isinstance(arg1, int):
            final_status = status_code or arg1
            final_code = code or (arg2 if isinstance(arg2, str) else "ERROR")
            final_msg = message or (str(arg3) if arg3 is not None else "")
        else:
            final_code = code or (arg1 if isinstance(arg1, str) else "ERROR")
            final_msg = message or (arg2 if isinstance(arg2, str) else "")
            if isinstance(arg3, int):
                final_status = status_code or arg3
            else:
                final_status = status_code or status.HTTP_400_BAD_REQUEST

        self.code = str(final_code)
        self.message = str(final_msg)
        self.status_code = int(final_status)
        super().__init__(self.message)


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", code: str = "NOT_FOUND"):
        super().__init__(code=code, message=message, status_code=status.HTTP_404_NOT_FOUND)

class UnauthorizedError(AppException):
    def __init__(self, message: str = "Could not validate credentials", code: str = "UNAUTHORIZED"):
        super().__init__(code=code, message=message, status_code=status.HTTP_401_UNAUTHORIZED)

class ForbiddenError(AppException):
    def __init__(self, message: str = "Operation not permitted", code: str = "FORBIDDEN"):
        super().__init__(code=code, message=message, status_code=status.HTTP_403_FORBIDDEN)

class ConflictError(AppException):
    def __init__(self, message: str = "Resource conflict", code: str = "CONFLICT"):
        super().__init__(code=code, message=message, status_code=status.HTTP_409_CONFLICT)

class IllegalStateTransitionError(AppException):
    def __init__(self, message: str = "Illegal state transition", code: str = "ILLEGAL_STATE_TRANSITION"):
        super().__init__(code=code, message=message, status_code=status.HTTP_400_BAD_REQUEST)

class RateLimitExceededError(AppException):
    def __init__(self, message: str = "Too many requests. Please try again later.", code: str = "RATE_LIMIT_EXCEEDED"):
        super().__init__(code=code, message=message, status_code=status.HTTP_429_TOO_MANY_REQUESTS)

async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-Id": request_id} if request_id else {}
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
        headers=headers,
    )

async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-Id": request_id} if request_id else {}
    
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "TOO_MANY_REQUESTS",
    }
    code = code_map.get(exc.status_code, "ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": code, "message": str(exc.detail)},
        headers=headers,
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-Id": request_id} if request_id else {}
    errors = exc.errors()
    first_error = errors[0]["msg"] if errors else "Invalid request payload"
    field = ".".join(str(loc) for loc in errors[0]["loc"]) if errors and "loc" in errors[0] else ""
    message = f"{first_error} at {field}" if field else first_error

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"code": "VALIDATION_ERROR", "message": message},
        headers=headers,
    )

async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-Id": request_id} if request_id else {}
    logger.exception(f"Unhandled server error [Request-ID: {request_id}]: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred. Please try again."},
        headers=headers,
    )
