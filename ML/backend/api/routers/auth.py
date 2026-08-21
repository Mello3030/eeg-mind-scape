"""Account registration, sign-in, and the current-session endpoint."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..ratelimit import client_key, enforce, login_limiter, register_limiter
from ..models import User
from ..schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalise_email(email: str) -> str:
    email = email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter a valid email address.")
    return email


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest, request: Request, db: Session = Depends(get_db)
) -> TokenResponse:
    enforce(register_limiter, request)
    email = _normalise_email(payload.email)
    if payload.role not in auth.ROLES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"role must be one of {list(auth.ROLES)}."
        )
    if db.query(User).filter(User.email == email).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists.")

    user = User(
        email=email,
        name=payload.name.strip(),
        password_hash=auth.hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(token=auth.create_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest, request: Request, db: Session = Depends(get_db)
) -> TokenResponse:
    enforce(login_limiter, request)
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Verify even when the user is unknown, so a missing account and a wrong
    # password take the same time and cannot be told apart by timing.
    stored = user.password_hash if user else auth.hash_password("no-such-user")
    if not auth.verify_password(payload.password, stored) or user is None:
        raise auth.AuthError("Incorrect email or password.")

    if auth.needs_rehash(user.password_hash):
        user.password_hash = auth.hash_password(payload.password)
        db.commit()

    # A few typos followed by the right password should not leave the researcher
    # throttled for the rest of the window.
    login_limiter.reset(client_key(request))
    return TokenResponse(token=auth.create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(auth.current_user)) -> UserOut:
    return UserOut.model_validate(user)
