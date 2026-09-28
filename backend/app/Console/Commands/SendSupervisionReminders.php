<?php

namespace App\Console\Commands;

use App\Models\SupervisionSignup;
use App\Support\NotificationSettings;
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
 *
 * Gated by administration (`NotificationSettings::supervisionReminder()`):
 * the whole block can be switched off, and the hour of day it starts
 * sending (`send_at`, default `08:00`) is configurable.
 * The command runs hourly (routes/console.php) and only acts once the
 * current hour (application time zone) reaches `send_at` — a later change
 * of `send_at` within the same day does not skip anyone, because
 * `reminder_sent_at` still guards each signup exactly once.
 */
class SendSupervisionReminders extends Command
{
    public const string NOTIFICATION_TYPE = 'supervision.reminder';

    protected $signature = 'supervision:send-reminders';

    protected $description = 'Wysyła przypomnienia o jutrzejszych terminach superwizji (raz na zapis).';

    public function handle(): int
    {
        $reminderBlock = NotificationSettings::supervisionReminder();

        if (! $reminderBlock['enabled']) {
            $this->info('Blok przypomnień o superwizji jest wyłączony — 0 wysłanych.');

            return self::SUCCESS;
        }

        $sendAtHour = (int) substr($reminderBlock['send_at'], 0, 2);
        $currentHour = Carbon::now(config('app.timezone'))->hour;

        if ($currentHour < $sendAtHour) {
            $this->info("Bieżąca godzina ({$currentHour}) nie osiągnęła jeszcze send_at ({$sendAtHour}) — 0 wysłanych.");

            return self::SUCCESS;
        }

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
