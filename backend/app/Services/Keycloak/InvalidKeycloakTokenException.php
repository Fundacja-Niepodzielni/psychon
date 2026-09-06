<?php

namespace App\Services\Keycloak;

use RuntimeException;
use Throwable;

/**
 * Any reason a bearer token is rejected — always surfaced as HTTP 401 by the
 * middleware. `reason` names WHICH of the five negative cases in criterion §3
 * fired : missing_token, malformed, signature, expired,
 * issuer, audience. Kept as one exception type with a reason code rather than
 * five subclasses, so the middleware has exactly one catch site.
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
