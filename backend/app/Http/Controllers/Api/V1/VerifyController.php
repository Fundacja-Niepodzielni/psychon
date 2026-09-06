<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Certificate;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H13 · Publiczna weryfikacja certyfikatu (bez uwierzytelnienia).
 *
 * GET /verify/{number}    — weryfikacja po numerze certyfikatu
 * GET /verify/qr/{token}  — weryfikacja po tokenie z kodu QR
 *
 * Numer nieznany oraz numer w błędnym formacie zwracają identyczny komunikat
 * 404 — nie ujawniamy oczekiwanego formatu (kontrakt: „Nie znaleziono
 * certyfikatu o podanym numerze.").
 */
class VerifyController extends Controller
{
    private const string NOT_FOUND_MESSAGE = 'Nie znaleziono certyfikatu o podanym numerze.';

    public function byNumber(string $number): JsonResponse
    {
        return $this->present(
            Certificate::with('edition')->where('number', $number)->first(),
        );
    }

    public function byQrToken(string $token): JsonResponse
    {
        return $this->present(
            Certificate::with('edition')->where('verification_token', $token)->first(),
        );
    }

    private function present(?Certificate $certificate): JsonResponse
    {
        if ($certificate === null) {
            throw new ApiException(404, 'not_found', self::NOT_FOUND_MESSAGE);
        }

        return response()->json(['data' => [
            'number' => $certificate->number,
            'status' => $certificate->revoked_at !== null ? 'revoked' : 'valid',
            'edition' => (string) ($certificate->edition?->starts_at?->year ?? ''),
            'issued_at' => $certificate->issued_at?->toIso8601ZuluString(),
        ]]);
    }
}
