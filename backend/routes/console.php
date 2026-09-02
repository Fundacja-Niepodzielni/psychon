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
Schedule::command('exports:purge-expired')->hourly();
