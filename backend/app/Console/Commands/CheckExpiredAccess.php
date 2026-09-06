<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * H04 · Zadanie cykliczne (moduł M2 pkt 5 / model danych §2.1).
 *
 * Blokowanie treści programu dzieje się na żywo w `EnsureAccessActive` przy
 * każdym żądaniu — nie zależy od tego zadania. To zadanie daje wyłącznie
 * widoczność operacyjną (log), ile kont ma wygasły dostęp bez ukończonego
 * programu. Celowo bez e-maili/powiadomień („access.expiring_30d/7d" to
 * jawnie post-hackathonowa pozycja w `01-pakiety-zadan.md` „Poza pakietami")
 * i bez wpisu audytowego (rejestr §3.2 nie ma sluga dla samego wygaśnięcia —
 * tylko `access.extended` przy przedłużeniu ma slug).
 */
class CheckExpiredAccess extends Command
{
    protected $signature = 'access:check-expired';

    protected $description = 'Zlicza i loguje konta z wygasłym dostępem czasowym (bez ukończonego programu).';

    public function handle(): int
    {
        $expired = User::query()
            ->whereNull('program_completed_at')
            ->whereNotNull('access_expires_at')
            ->where('access_expires_at', '<', now())
            ->pluck('id');

        if ($expired->isEmpty()) {
            $this->info('Brak kont z wygasłym dostępem.');

            return self::SUCCESS;
        }

        Log::info('access:check-expired — konta z wygasłym dostępem', [
            'count' => $expired->count(),
            'user_ids' => $expired->all(),
        ]);

        $this->info("Wygasły dostęp: {$expired->count()} kont(a) — id: ".$expired->implode(', '));

        return self::SUCCESS;
    }
}
