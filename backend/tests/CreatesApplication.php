<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\ParallelTesting;
use Tests\Concerns\ProcessDatabaseAnnouncement;

/**
 * Aplikacja procesu NADRZĘDNEGO przebiegu równoległego — i jedyne miejsce, w którym
 * da się zarejestrować cokolwiek na `ParallelTesting::setUpProcess()`.
 *
 * Runner szuka tej cechy sam; cytat z własnego `grep -n`:
 *   `vendor/laravel/framework/src/Illuminate/Testing/Concerns/RunsInParallel.php:168-174`
 *     `if (trait_exists(\Tests\CreatesApplication::class)) { … ->createApplication(); }`
 *   inaczej (wiersze 175-180) ładuje `bootstrap/app.php` sam — i to samo robimy niżej,
 *   żeby ta cecha NIE zmieniała sposobu budowania aplikacji, tylko dokładała rejestrację.
 *
 * Rejestracja musi siedzieć TU, a nie w dostawcy usług aplikacji, z dwóch powodów:
 *   1. `RunsInParallel::forEachProcess()` (`:149-155`) tworzy dla KAŻDEGO tokena ŚWIEŻĄ
 *      aplikację, czyli świeży kontener i świeży `ParallelTesting` — wpis zrobiony raz,
 *      w bootstrapie PHPUnita, zginąłby przy pierwszym `flush()`;
 *   2. dostawcy usług mieszkają w `backend/app`, czyli w kodzie PRODUKTU. Przyrząd
 *      pomiarowy nie ma prawa tam mieszkać: to, czym mierzymy, nie może być częścią
 *      tego, co mierzymy.
 */
trait CreatesApplication
{
    public function createApplication(): Application
    {
        $app = require Application::inferBasePath().'/bootstrap/app.php';

        $app->make(Kernel::class)->bootstrap();

        ParallelTesting::setUpProcess(static function (): void {
            ProcessDatabaseAnnouncement::announce();
        });

        return $app;
    }
}
