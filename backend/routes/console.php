<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// H04 · Dostęp czasowy — zadanie cykliczne (docs/system/02-model-danych.md §2.1).
Schedule::command('access:check-expired')->daily();

// H01 · Eksport RODO — paczka z danymi osobowymi znika po terminie ważności
// (config/exports.php `ttl_hours`). Godzinowo, bo TTL liczy się w godzinach.
Schedule::command('exports:purge-expired')->hourly()->withoutOverlapping();

// H12 · Superwizja — day-before reminder for every active signup, once per signup
// (`supervision_signups.reminder_sent_at`). Hourly: the command itself gates on
// the administration's block toggle and configurable `send_at` hour
// (`NotificationSettings::supervisionReminder()`), application time zone; a
// same-day change of `send_at` is caught within the hour, not only the next day.
Schedule::command('supervision:send-reminders')->hourly()->withoutOverlapping();
