<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/sso/potwierdzenie-aktywacji — odnotowuje pokazanie
 * jednorazowego komunikatu "Twoje konto zostało aktywowane" na WŁASNYM
 * koncie wywołującego. Chroniona przez `auth:keycloak`, więc zawsze działa
 * na `$request->user()` — nie ma żadnego identyfikatora celu, więc nie ma
 * sposobu, żeby wskazać cudze konto.
 *
 * Kolejność w ciele metody ma znaczenie i jest tu celowa: stan czytamy
 * PRZED zapisem, nie po. Poprzednia dostawa czytała po zapisie i przez to
 * odpowiedź zawsze niosła `false` — nie istniała ścieżka dająca `true`.
 * Pierwsze wejście (`keycloak_sub` ustawiony, znacznik jeszcze `null`)
 * zwraca `true` i DOPIERO WTEDY zapisuje znacznik; każde kolejne wejście
 * czyta znacznik już ustawiony i zwraca `false`. Idempotentność samego
 * zapisu żyje w `User::recordActivationConfirmationShown()`.
 */
class SsoActivationConfirmationController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        $shouldShow = $user->shouldShowActivationConfirmation();

        $user->recordActivationConfirmationShown();

        return response()->json([
            'data' => [
                'show_activation_confirmation' => $shouldShow,
            ],
        ]);
    }
}
