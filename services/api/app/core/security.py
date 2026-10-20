import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings
from app.core.exceptions import UnauthorizedError

# Argon2id password hashing
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify raw password against Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generate Argon2 password hash."""
    return pwd_context.hash(password)

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> Tuple[str, str, int]:
    """
    Create a signed JWT access token.
    Returns: (token_string, jti, expires_at_timestamp_ms)
    """
    to_encode = data.copy()
    jti = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    expires_at_ms = int(expire.timestamp() * 1000)

    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": jti,
        "type": "access",
    })
    token = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, expires_at_ms

def create_refresh_token(
    user_id: str,
    email: str,
    role: str
) -> Tuple[str, str, int]:
    """
    Create a signed JWT refresh token.
    Returns: (token_string, jti, expires_at_timestamp_ms)
    """
    jti = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    expires_at_ms = int(expire.timestamp() * 1000)

    to_encode = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
        "iat": now,
        "jti": jti,
        "type": "refresh",
    }
    token = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, expires_at_ms

def decode_jwt_token(token: str) -> dict:
    """
    Decode and validate a JWT token.
    Raises UnauthorizedError if invalid or expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError as e:
        raise UnauthorizedError(message=f"Invalid or expired token: {str(e)}")
