<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmailResource;
use App\Models\EmailMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * H16 · Skrzynka e-maili symulowanych — administracja (#/admin/emails).
 * Nic nigdy nie wychodzi w świat (status zawsze `simulated` na hackathonie).
 */
class EmailController extends Controller
{
    /**
     * GET /admin/emails
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = EmailMessage::query()
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'data' => EmailResource::collection($paginator->items())->resolve(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'extra' => [
                    'from' => $this->configuredSender(),
                ],
            ],
        ]);
    }

    /**
     * Rzeczywisty skonfigurowany nadawca (`config('mail.from')`, czyli
     * `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME`) — nie WARTOŚĆ na sztywno w
     * ekranie, tylko odczyt tego, co system ma dziś ustawione.
     *
     * `null`, gdy wdrożenie NIE ustawiło zmiennej środowiskowej —
     * rozpoznane przez `config('mail.from_configured')` (liczone przy
     * wczytaniu konfiguracji, patrz `config/mail.php`; celowo OBOK
     * `mail.from`, nie w jego środku — ten zbiór jako całość czyta sam
     * mechanizm wysyłki), a nie przez pusty łańcuch:
     * `config('mail.from.address')` ZAWSZE zwraca jakiś tekst, bo ma
     * wbudowaną wartość zastępczą z domeny przykładowej, gdy zmiennej
     * brak — ta wartość zastępcza wygląda jak prawdziwy adres i nie wolno
     * jej pokazywać jako stanu faktycznego.
     *
     * @return array{address: string, name: string|null}|null
     */
    private function configuredSender(): ?array
    {
        if (config('mail.from_configured') !== true) {
            return null;
        }

        $address = trim((string) config('mail.from.address'));
        if ($address === '') {
            return null;
        }

        $name = trim((string) config('mail.from.name'));

        return [
            'address' => $address,
            'name' => $name !== '' ? $name : null,
        ];
    }
}
