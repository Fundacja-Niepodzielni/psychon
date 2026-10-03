<?php

namespace App\Console\Commands;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use App\Support\Emails\EmailOutbox;
use App\Support\Emails\EmailRenderer;
use App\Support\Emails\EmailValues;
use App\Support\Notify;
use Carbon\CarbonInterface;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * H04 · Zadanie cykliczne (moduł M2 pkt 5 / model danych §2.1), uruchamiane
 * raz dziennie.
 *
 * Blokowanie treści programu dzieje się na żywo w `EnsureAccessActive` przy
 * każdym żądaniu — nie zależy od tego zadania. Zadanie daje widoczność
 * operacyjną (log), ile kont ma wygasły dostęp bez ukończonego programu,
 * i wysyła e-maile o końcu dostępu według treści e-maili:
 *
 * - E-29 (`access.expiring_7d`) — 7 dni przed dniem końca dostępu;
 * - E-30 (`access.expired`) — dzień po dniu końca dostępu, raz;
 * - E-31 (tylko e-mail) — 30 dni przed usunięciem danych konta, czyli przed
 *   upływem 12 miesięcy od końca dostępu (model danych §5).
 *
 * Każdy z nich dotyczy wyłącznie aktywnego konta bez ukończonego programu
 * (E-31 także bez anonimizacji). Dni liczone w strefie aplikacji. Ponowne
 * uruchomienie tego samego dnia nie wysyła drugi raz. Bez wpisu audytowego
 * (rejestr §3.2 nie ma sluga dla samego wygaśnięcia).
 */
class CheckExpiredAccess extends Command
{
    /** Konto nieaktywne po wygaśnięciu: anonimizacja po 12 miesiącach. */
    public const int RETENTION_MONTHS = 12;

    public const int REMINDER_DAYS = 7;

    public const int REMOVAL_NOTICE_DAYS = 30;

    protected $signature = 'access:check-expired';

    protected $description = 'Zlicza konta z wygasłym dostępem i wysyła e-maile o końcu dostępu (E-29, E-30, E-31).';

    public function handle(): int
    {
        $today = Carbon::now((string) config('app.timezone'))->startOfDay();

        $this->sendExpiringReminders($today);
        $this->sendExpiredNotices($today);
        $this->sendRemovalNotices($today);

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

    /**
     * E-29: dzień końca dostępu wypada za 7 dni.
     */
    private function sendExpiringReminders(CarbonInterface $today): void
    {
        foreach ($this->accountsWithAccessEndingOn($today->copy()->addDays(self::REMINDER_DAYS)) as $user) {
            if ($this->notifiedSince($user, 'access.expiring_7d', $today)) {
                continue;
            }

            Notify::send(
                $user,
                'access.expiring_7d',
                'Dostęp kończy się za 7 dni',
                'Za 7 dni kończy się Twój dostęp do materiałów programu. Datę końca dostępu zobaczysz w profilu.',
                '/panel/profil',
            );
        }
    }

    /**
     * E-30: dzień końca dostępu był wczoraj. Przedłużony dostęp ma inną datę,
     * więc nie trafia do tej grupy.
     */
    private function sendExpiredNotices(CarbonInterface $today): void
    {
        foreach ($this->accountsWithAccessEndingOn($today->copy()->subDay()) as $user) {
            if ($this->notifiedSince($user, 'access.expired', $today)) {
                continue;
            }

            Notify::send(
                $user,
                'access.expired',
                'Dostęp do materiałów się zakończył',
                'Twój dostęp do materiałów programu zakończył się. Okno pomocy działa także po zakończeniu dostępu.',
                '/dostep-wygasl',
            );
        }
    }

    /**
     * E-31: do usunięcia danych (12 miesięcy po dniu końca dostępu) zostało
     * 30 dni.
     */
    private function sendRemovalNotices(CarbonInterface $today): void
    {
        $removalDay = $today->copy()->addDays(self::REMOVAL_NOTICE_DAYS);
        $accessEndDay = $removalDay->copy()->subMonthsNoOverflow(self::RETENTION_MONTHS);
        $subject = EmailRenderer::render('E-31', ['deletionDate' => '-'])->subject;

        $users = $this->accountsWithAccessEndingOn($accessEndDay)->whereNull('anonymized_at');

        foreach ($users as $user) {
            $alreadySent = EmailMessage::query()
                ->where('to_user_id', $user->id)
                ->where('subject', $subject)
                ->where('created_at', '>=', $today)
                ->exists();

            if ($alreadySent) {
                continue;
            }

            EmailOutbox::simulate($user, 'E-31', ['deletionDate' => EmailValues::date($removalDay).' r.']);
        }
    }

    /**
     * Aktywne konta bez ukończonego programu, których dzień końca dostępu
     * (w strefie aplikacji) to `$day`.
     *
     * @return Collection<int, User>
     */
    private function accountsWithAccessEndingOn(CarbonInterface $day)
    {
        $timezone = (string) config('app.timezone');
        $from = Carbon::parse($day->format('Y-m-d'), $timezone)->startOfDay();

        return User::query()
            ->where('status', 'active')
            ->whereNull('program_completed_at')
            ->whereNotNull('access_expires_at')
            ->where('access_expires_at', '>=', $from)
            ->where('access_expires_at', '<', $from->copy()->addDay())
            ->orderBy('id')
            ->get();
    }

    private function notifiedSince(User $user, string $type, CarbonInterface $today): bool
    {
        return Notification::query()
            ->where('user_id', $user->id)
            ->where('type', $type)
            ->where('created_at', '>=', $today)
            ->exists();
    }
}
