"""A small in-process rate limiter for the authentication routes.

Sign-in had no throttle at all: twelve wrong passwords went through in about a
second, and Argon2's ~80 ms per verify is not a defence against a scripted
attempt. This caps attempts per client.

Deliberately in-process. The deployment is a single instance serving a handful of
researchers, so a shared store would add an operational dependency (Redis) that
buys nothing here. If the API is ever scaled to several instances this becomes
per-instance and should be replaced.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Fixed-window-per-key limiter over a sliding deque of timestamps."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> int | None:
        """Record an attempt. Returns seconds to wait when over the limit."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            cutoff = now - self.window
            while hits and hits[0] < cutoff:
                hits.popleft()

            if len(hits) >= self.limit:
                return max(1, int(hits[0] + self.window - now))

            hits.append(now)
            # Keys are only created on use; drop the empty ones so a long-running
            # process does not accumulate an entry per address seen.
            if not hits:
                del self._hits[key]
            return None

    def reset(self, key: str) -> None:
        """Forget a key's attempts — called after a successful sign-in."""
        with self._lock:
            self._hits.pop(key, None)


def client_key(request: Request) -> str:
    """Best-effort client identity.

    Render terminates TLS upstream, so the socket address is the proxy's; the
    forwarded header carries the real client. It is spoofable, which is why this
    is a throttle and not an access control.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(limiter: RateLimiter, request: Request) -> None:
    retry_after = limiter.check(client_key(request))
    if retry_after is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many attempts. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


# Ten attempts per quarter hour: generous for a mistyped password, useless for a
# script working through a wordlist.
login_limiter = RateLimiter(limit=10, window_seconds=900)
register_limiter = RateLimiter(limit=5, window_seconds=3600)
