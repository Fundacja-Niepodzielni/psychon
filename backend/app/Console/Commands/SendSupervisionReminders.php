<?php

namespace App\Console\Commands;

use App\Models\SupervisionSignup;
use App\Support\Notify;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Day-before reminder for supervision slots. Every active signup on a slot
 * that starts tomorrow (application time zone) gets one bell notification.
 *
 * Idempotent: a signup is claimed under a row lock and stamped with
 * `reminder_sent_at` in the same transaction as the notification, so running
 * the command twice — or two overlapping runs — yields one notification per
 * person.
 */
class SendSupervisionReminders extends Command
{
    public const string NOTIFICATION_TYPE = 'supervision.reminder';

    protected $signature = 'supervision:send-reminders';

    protected $description = 'Wysyła przypomnienia o jutrzejszych terminach superwizji (raz na zapis).';

    public function handle(): int
    {
        $tomorrow = Carbon::now(config('app.timezone'))->addDay();
        $from = $tomorrow->copy()->startOfDay();
        $to = $tomorrow->copy()->endOfDay();

        $candidateIds = SupervisionSignup::query()
            ->whereNull('cancelled_at')
            ->whereNull('reminder_sent_at')
            ->whereHas('slot', fn ($query) => $query->whereBetween('starts_at', [$from, $to]))
            ->orderBy('id')
            ->pluck('id');

        $sent = 0;

        foreach ($candidateIds as $signupId) {
            $sent += DB::transaction(function () use ($signupId): int {
                $signup = SupervisionSignup::query()
                    ->whereKey($signupId)
                    ->whereNull('cancelled_at')
                    ->whereNull('reminder_sent_at')
                    ->lockForUpdate()
                    ->with(['slot', 'user'])
                    ->first();

                if ($signup === null) {
                    return 0;
                }

                $when = $signup->slot->starts_at->format('d.m.Y, H:i');
                $where = $signup->slot->location_or_link;

                Notify::send(
                    $signup->user,
                    self::NOTIFICATION_TYPE,
                    'Jutro superwizja',
                    $where !== null && $where !== ''
                        ? "Przypominamy o superwizji {$when}. Miejsce: {$where}."
                        : "Przypominamy o superwizji {$when}.",
                    '/panel/superwizja',
                );

                $signup->forceFill(['reminder_sent_at' => now()])->save();

                return 1;
            });
        }

        $this->info("Wysłane przypomnienia: {$sent}.");

        return self::SUCCESS;
    }
}
