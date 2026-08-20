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

(function (): void {
    $connection = $_ENV['DB_CONNECTION'] ?? getenv('DB_CONNECTION') ?: 'pgsql';

    if ($connection !== 'pgsql') {
        return;
    }

    $host = $_ENV['DB_HOST'] ?? getenv('DB_HOST') ?: 'pgsql';
    $port = $_ENV['DB_PORT'] ?? getenv('DB_PORT') ?: '5432';
    $username = $_ENV['DB_USERNAME'] ?? getenv('DB_USERNAME') ?: 'niepodzielni';
    $password = $_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: 'secret';
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
