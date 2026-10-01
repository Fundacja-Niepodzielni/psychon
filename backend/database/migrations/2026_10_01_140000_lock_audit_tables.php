<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Blokada dwóch dzienników na poziomie bazy: `audit_log` i `sensitive_access_log`.
     *
     * Do tej pory niezmienność dziennika trzymała się wyłącznie umowy w kodzie
     * (brak tras modyfikacji, brak `updated_at`). Jedno zapytanie napisane przez
     * pomyłkę zmieniało albo kasowało wiersze bez żadnego objawu, a usunięcie konta
     * robiło to samo drogą klucza obcego: `actor_id` był zerowany, wiersze wglądu
     * do danych wrażliwych znikały kaskadą.
     *
     * Co zakłada ta migracja:
     *   - wyzwalacz na obu tabelach: zmiana wiersza (UPDATE) jest odrzucana ZAWSZE;
     *     usunięcie (DELETE) i opróżnienie (TRUNCATE) są odrzucane, chyba że w
     *     BIEŻĄCEJ transakcji ustawiono lokalnie przełącznik. Dopisanie przechodzi;
     *   - oba klucze obce do `users` odmawiają usunięcia konta, które ma wiersz
     *     dziennika (zamiast zerowania i kaskady).
     *
     * Przełącznik jest ważny tylko w transakcji, która go ustawiła: jego wartością
     * jest identyfikator tej transakcji, a wyzwalacz porównuje go z identyfikatorem
     * transakcji, w której sam działa. Wartość ustawiona na poziomie sesji albo
     * pozostała po innej transakcji niczego nie otwiera. Jedyne miejsce, które go
     * ustawia, to wspólny pomocnik w `app/Support`.
     *
     * Czym ta blokada NIE jest: barierą przed kimś, kto działa z uprawnieniami
     * właściciela tabel (taka osoba może zdjąć wyzwalacz). To zabezpieczenie przed
     * błędem aplikacji, nie przed przejęciem roli bazy.
     *
     * Wyzwalacze są poziomu polecenia, więc odmowa pada także wtedy, gdy polecenie
     * nie objęłoby żadnego wiersza. Sama migracja nie zmienia ani jednego wiersza
     * i przechodzi na bazie z istniejącymi wpisami obu dzienników.
     */
    public function up(): void
    {
        Schema::table('audit_log', function (Blueprint $table): void {
            $table->dropForeign(['actor_id']);
            $table->foreign('actor_id')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::table('sensitive_access_log', function (Blueprint $table): void {
            $table->dropForeign(['viewer_id']);
            $table->foreign('viewer_id')->references('id')->on('users')->restrictOnDelete();
        });

        DB::unprepared(<<<'SQL'
            CREATE FUNCTION audit_tables_lock_guard() RETURNS trigger
            LANGUAGE plpgsql AS $body$
            BEGIN
                IF TG_OP = 'UPDATE' THEN
                    RAISE EXCEPTION 'audit tables lock: % on % is refused', TG_OP, TG_TABLE_NAME
                        USING ERRCODE = 'insufficient_privilege';
                END IF;

                IF COALESCE(current_setting('psychon.audit_tables_purge', true), '') = pg_current_xact_id()::text THEN
                    RETURN NULL;
                END IF;

                RAISE EXCEPTION 'audit tables lock: % on % is refused', TG_OP, TG_TABLE_NAME
                    USING ERRCODE = 'insufficient_privilege';
            END;
            $body$;

            CREATE TRIGGER audit_log_lock
                BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
                FOR EACH STATEMENT EXECUTE FUNCTION audit_tables_lock_guard();

            CREATE TRIGGER sensitive_access_log_lock
                BEFORE UPDATE OR DELETE OR TRUNCATE ON sensitive_access_log
                FOR EACH STATEMENT EXECUTE FUNCTION audit_tables_lock_guard();
            SQL);
    }

    /**
     * Zdejmuje wyłącznie to, co założyło `up()`, i przywraca oba klucze obce do
     * stanu sprzed tej migracji (`actor_id`: zerowanie, `viewer_id`: kaskada).
     */
    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS sensitive_access_log_lock ON sensitive_access_log;
            DROP TRIGGER IF EXISTS audit_log_lock ON audit_log;
            DROP FUNCTION IF EXISTS audit_tables_lock_guard();
            SQL);

        Schema::table('sensitive_access_log', function (Blueprint $table): void {
            $table->dropForeign(['viewer_id']);
            $table->foreign('viewer_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('audit_log', function (Blueprint $table): void {
            $table->dropForeign(['actor_id']);
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
        });
    }
};
