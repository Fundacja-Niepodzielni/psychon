<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/**
 * Renders every API error in the single allowed envelope (contract §1):
 * {"error": {"status", "code", "message", "errors"?, "reason"?}}.
 */
final class ApiExceptionRenderer
{
    public static function handle(Throwable $e, Request $request): ?JsonResponse
    {
        if (! $request->is('api/*')) {
            return null; // web routes keep the default rendering
        }

        return match (true) {
            $e instanceof ApiException => self::envelope(
                $e->status,
                $e->errorCode,
                $e->getMessage(),
                errors: $e->errors,
                reason: $e->reason,
            ),
            $e instanceof ValidationException => self::envelope(
                422,
                'validation_failed',
                'Popraw zaznaczone pola.',
                errors: $e->errors(),
            ),
            $e instanceof AuthenticationException => self::envelope(
                401,
                'unauthenticated',
                'Zaloguj się, aby kontynuować.',
            ),
            $e instanceof AuthorizationException,
            $e instanceof AccessDeniedHttpException => self::envelope(
                403,
                'forbidden',
                'Nie masz dostępu do tego zasobu.',
            ),
            $e instanceof ModelNotFoundException,
            $e instanceof NotFoundHttpException => self::envelope(
                404,
                'not_found',
                'Nie znaleziono zasobu.',
            ),
            $e instanceof ThrottleRequestsException => self::envelope(
                429,
                'too_many_attempts',
                'Zbyt wiele prób. Spróbuj ponownie za chwilę.',
            ),
            $e instanceof MethodNotAllowedHttpException => self::envelope(
                405,
                'method_not_allowed',
                'Metoda niedozwolona dla tej trasy.',
            ),
            $e instanceof HttpExceptionInterface => self::envelope(
                $e->getStatusCode(),
                'http_error',
                $e->getMessage() !== '' ? $e->getMessage() : 'Wystąpił błąd żądania.',
            ),
            default => self::envelope(
                500,
                'server_error',
                config('app.debug') ? $e->getMessage() : 'Wystąpił błąd serwera. Spróbuj ponownie.',
            ),
        };
    }

    private static function envelope(
        int $status,
        string $code,
        string $message,
        ?array $errors = null,
        ?array $reason = null,
    ): JsonResponse {
        $error = [
            'status' => $status,
            'code' => $code,
            'message' => $message,
        ];

        if ($errors !== null) {
            $error['errors'] = $errors;
        }

        if ($reason !== null) {
            $error['reason'] = $reason;
        }

        return response()->json(['error' => $error], $status);
    }
}
