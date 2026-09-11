<?php

/*
|--------------------------------------------------------------------------
| PHPUnit bootstrap — testing database on PostgreSQL
|--------------------------------------------------------------------------
| Tests run against the docker `pgsql` service on a SEPARATE database
| (`niepodzielni_testing`) so `php artisan test` never wipes the seeded
| demo data. The database is created here on first run. Credentials match
| docker-compose defaults (dev-only).
*/

require __DIR__.'/../vendor/autoload.php';

/*
|--------------------------------------------------------------------------
| Domknięcie cichej podmiany bazy testowej — `force="true"` samo NIE wystarcza (pomiar 02.09.2026)
|--------------------------------------------------------------------------
| PHPUnit dla wpisu `<env force="true">` wykonuje `putenv()` i ustawia `$_ENV`,
| ale NIE dotyka `$_SERVER`. Laravel czyta zmienne przez repozytorium Dotenv,
| w którym `ServerConstAdapter` stoi PRZED `EnvConstAdapter` — więc wartość
| wstrzyknięta do kontenera (`docker compose exec -e DB_DATABASE=…`, zmienne
| zadania CI, `environment:` w compose) wygrywa z `phpunit.xml` MIMO `force`.
|
| Zmierzone w tym miejscu, w tym klonie:
|   $_ENV='niepodzielni_testing'  $_SERVER='niepodzielni'  → silnik: niepodzielni
|
| PhpHandler PHPUnita działa PRZED tym plikiem, więc `$_ENV` jest tu już
| rozstrzygnięty i można z niego odtworzyć `$_SERVER`. Źródłem prawdy zostaje
| `phpunit.xml`: bierzemy dokładnie te klucze, które ten plik wymusza.
*/
(function (): void {
    $configuration = __DIR__.'/../phpunit.xml';

    if (! is_file($configuration)) {
        return;
    }

    $xml = @simplexml_load_file($configuration);

    if ($xml === false) {
        return;
    }

    // WYJĄTEK TOPOLOGICZNY. `DB_HOST` i `DB_PORT` mówią, GDZIE stoi serwer, a nie
    // NA CZYM biegną testy — i różnią się między środowiskami zgodnie z prawem:
    // w stosie docker serwer nazywa się `pgsql`, w zadaniu CI usługa jest widoczna
    // wyłącznie pod `127.0.0.1` (zadanie biegnie na maszynie runnera, nie w kontenerze,
    // więc etykieta usługi NIE jest nazwą hosta). Wymuszenie topologii z `phpunit.xml`
    // zaczerwieniłoby CI na nieistniejącym hoście.
    //
    // Cicha podmiana bazy dotyczy TOŻSAMOŚCI bazy, nie adresu serwera: podmieniona
    // baza wygląda jak zielone, a zła nazwa hosta pada głośno przy pierwszym połączeniu.
    // Dlatego wymuszamy semantykę, a topologię zostawiamy środowisku.
    //
    // Lista jest WYLICZONA celowo i jest zamknięta: wyjątek przyjęty pod warunkiem,
    // że stoi w kodzie, a nie w czyjejś pamięci. Dopisanie do niej
    // czegokolwiek poza topologią połączenia otwiera tę samą lukę z powrotem.
    $topologia = ['DB_HOST', 'DB_PORT'];

    foreach ($xml->xpath('//php/env') ?: [] as $entry) {
        if (((string) ($entry['force'] ?? '')) !== 'true') {
            continue;
        }

        $name = (string) $entry['name'];

        if (in_array($name, $topologia, true) && array_key_exists($name, $_SERVER)) {
            // Zostawiamy `$_SERVER` przy prawdziwej wartości środowiska — ale PHPUnit
            // zdążył już wywołać `putenv()` z wartością z `phpunit.xml` (pgsql), więc
            // PRAWDZIWE środowisko OS (`getenv`/`$_ENV`) i tak niesie podmienioną wartość.
            // Proces potomny (`Process::run([PHP_BINARY, ...])`) dziedziczy WYŁĄCZNIE
            // środowisko OS, nie pamięć PHP rodzica — więc bez tej korekty dziecko
            // widziałoby `pgsql` tam, gdzie rodzic (i realna topologia CI) widzi
            // `127.0.0.1`, i padało z błędem DNS mimo że rodzic działa poprawnie.
            // Domykamy więc rozjazd rodzic-dziecko w JEDNYM miejscu, dla obu kluczy
            // z zamkniętej listy `$topologia`, zamiast łatać poszczególne testy.
            // Zmierzone (F-88, pomiar 11.09.2026): rodzic $_SERVER=127.0.0.1,
            // rodzic getenv=pgsql, dziecko getenv/$_SERVER=pgsql — bez tej poprawki.
            $realValue = $_SERVER[$name];
            putenv("{$name}={$realValue}");
            $_ENV[$name] = $realValue;

            continue;
        }

        // `$_ENV` jest tu wartością już wymuszoną przez PHPUnit — przepisujemy ją
        // tam, gdzie Laravel naprawdę patrzy.
        if (array_key_exists($name, $_ENV)) {
            $_SERVER[$name] = $_ENV[$name];
        }
    }
})();

(function (): void {
    $connection = $_SERVER['DB_CONNECTION'] ?? $_ENV['DB_CONNECTION'] ?? getenv('DB_CONNECTION') ?: 'pgsql';

    if ($connection !== 'pgsql') {
        return;
    }

    $host = $_SERVER['DB_HOST'] ?? $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: 'pgsql';
    $port = $_SERVER['DB_PORT'] ?? $_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: '5432';
    $username = $_SERVER['DB_USERNAME'] ?? $_ENV['DB_USERNAME'] ?? getenv('DB_USERNAME') ?: 'niepodzielni';
    $password = $_SERVER['DB_PASSWORD'] ?? $_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: 'secret';
    $database = 'niepodzielni_testing';

    try {
        $pdo = new PDO(
            "pgsql:host={$host};port={$port};dbname=postgres",
            $username,
            $password,
            [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
        );

        $statement = $pdo->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
        $statement->execute([$database]);

        if ($statement->fetchColumn() === false) {
            $pdo->exec("CREATE DATABASE {$database}");
        }
    } catch (Throwable) {
        // Outside docker the connection may fail here — the test run itself
        // will report the actual connection problem with a clearer message.
    }
})();
