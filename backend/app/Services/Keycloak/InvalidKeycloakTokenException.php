<?php

namespace App\Services\Keycloak;

use RuntimeException;
use Throwable;

/**
 * Any reason a bearer token is rejected — always surfaced as HTTP 401 by the
 * middleware. `reason` names WHICH negative case fired: the token-shape
 * cases from criterion §3 (missing_token, malformed, signature, expired,
 * issuer, audience), plus two the back-channel logout read path can raise
 * once it consults the invalidation marker store — session_invalidated (a
 * confirmed marker for this token's `sid`) and session_check_unavailable
 * (the marker store could not be read; fail-safe treats this as
 * "not invalidated → refuse", never "no marker → let in"). Kept as one
 * exception type with a reason code rather than per-case subclasses, so the
 * middleware has exactly one catch site.
 */
final class InvalidKeycloakTokenException extends RuntimeException
{
    public function __construct(
        public readonly string $reason,
        string $message,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
