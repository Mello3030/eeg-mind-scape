"""Password hashing, JWT issuing, and the FastAPI auth dependencies.

Argon2id is used for password storage (argon2-cffi ships a vetted default
parameterisation, so no tuning is encoded here). Tokens are stateless HS256
JWTs — there is no server-side session table, so signing out is a client-side
token discard.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..app.config import get_settings
from .db import get_db
from .models import User

_hasher = PasswordHasher()

ROLES = ("researcher", "administrator")


class AuthError(HTTPException):
    def __init__(self, detail: str, code: int = status.HTTP_401_UNAUTHORIZED) -> None:
        super().__init__(code, detail, headers={"WWW-Authenticate": "Bearer"})


# --- Passwords --------------------------------------------------------------
def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return True


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash predates the current argon2 parameters."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


# --- Tokens -----------------------------------------------------------------
def create_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_expire_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Session expired. Sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid authentication token.") from exc


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


# --- Dependencies -----------------------------------------------------------
def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Resolve the caller if a valid token is present, otherwise None."""
    token = _bearer_token(request)
    if token is None:
        return None
    payload = decode_token(token)
    user = db.get(User, payload.get("sub") or "")
    return user


def current_user(user: User | None = Depends(optional_user)) -> User:
    """Require an authenticated caller."""
    if user is None:
        raise AuthError("Authentication required.")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "administrator":
        raise AuthError("Administrator role required.", status.HTTP_403_FORBIDDEN)
    return user


def scope_of(user: User) -> str | None:
    """Owner filter for a caller: ``None`` for an administrator, who sees every
    record, otherwise their own id."""
    return None if user.role == "administrator" else user.id
