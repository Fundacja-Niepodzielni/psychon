<?php

namespace App\Exceptions;

use Exception;

/**
 * Domain HTTP exception rendered in the contract error envelope (§1):
 * {"error": {"status", "code", "message", "errors"?, "reason"?}}.
 *
 * Usage in packages, e.g.:
 *   throw new ApiException(403, 'course_locked', 'Ukończ najpierw etap 2.',
 *       reason: ['required_course_id' => 2, 'missing' => ['lessons', 'test']]);
 */
class ApiException extends Exception
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly ?array $reason = null,
        public readonly ?array $errors = null,
    ) {
        parent::__construct($message);
    }
}
