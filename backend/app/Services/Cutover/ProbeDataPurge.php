<?php

namespace App\Services\Cutover;

use App\Support\AuditLog;
use App\Support\AuditTablesLock;
use App\Support\ProductionStart;
use App\Support\RestoreTrial;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Przejscie ze srodowiska testowego na produkcje: usuwa osoby probne i ich
 * slady, zostawia tresc programu i konta personelu z listy podanej w chwili
 * biegu (identyfikatory z pliku poza repozytorium - nigdy e-mail).
 *
 * Kazda tabela bazy ma tu jedna z czterech kategorii; tabela, ktorej nie ma
 * w zadnej, blokuje bieg - nowa tabela dodana pozniej nie moze przejsc po
 * cichu ani jako "zostaje", ani jako "usuwana".
 *
 *  - TRESC (CONTENT_TABLES)  - zostaje w calosci;
 *  - LICZONA (COUNTED_TABLES) - zostaje, wypisywana jest tylko liczba wierszy;
 *  - SLAD (PURGE, tryb 'all') - aktywnosc osob i dzienniki fazy testowej,
 *    usuwane w calosci, takze dla kont, ktore zostaja;
 *  - KONTO (PURGE, tryb 'not_kept'/'not_kept_sub') - wiersze kont spoza listy;
 *    wiersze kont z listy zostaja.
 *
 * Czyszczenie jest jednorazowe. Bieg wlasciwy w jednej transakcji: otwiera
 * blokade dziennikow (tylko na te transakcje), usuwa slady i konta, a na koncu
 * zapisuje JEDEN wpis `trial_data.purged` (pierwszy wpis dziennika produkcji)
 * i znacznik startu produkcji (`ProductionStart`). Po znaczniku kazdy kolejny
 * bieg - takze na sucho - jest odmowiony; dziala tylko `verify()` (--sprawdz).
 *
 * Do wyjscia trafiaja wylacznie nazwy tabel i liczby. Wartosci pol (imiona,
 * e-maile, PESEL, sciezki plikow) nigdy nie sa wypisywane ani logowane. Wpis
 * `trial_data.purged` niesie wylacznie liczniki i kod zrodla uruchomienia - bez osoby,
 * bez wolnego tekstu.
 */
final class ProbeDataPurge
{
    /** Dwa dzienniki chronione blokada w bazie. */
    public const array JOURNALS = ['audit_log', 'sensitive_access_log'];

    /** Kod zrodla uruchomienia we wpisie `trial_data.purged` (osoba jest tylko w protokole poza repozytorium). */
    public const string EXECUTOR = 'console';

    /** Role personelu, ktorych konta moga zostac (kontrakt §3.4). */
    public const array STAFF_ROLES = ['super_admin', 'project_manager', 'instructor'];

    /** Dysk plikow osob (eksporty, dokumenty, certyfikaty, skany, zalaczniki profilu). */
    public const string DISK = 'local';

    /** Tresc programu i konfiguracja - zostaje w calosci. */
    public const array CONTENT_TABLES = [
        'migrations',
        'editions',
        'settings',
        'courses',
        'course_topics',
        'lessons',
        'materials',
        'tests',
        'test_questions',
        'test_answers',
        'legal_document_versions',
        'document_templates',
        'document_template_versions',
        'internship_forms',
        // Znaczniki unieważnionych sesji (sam identyfikator sesji, bez osoby).
        // Usuniecie znacznika przywrociloby unieważniona sesje do zycia.
        'keycloak_logout_markers',
    ];

    /** Zostaja, wypisywana jest tylko liczba wierszy (pamiec podreczna aplikacji). */
    public const array COUNTED_TABLES = ['cache', 'cache_locks'];

    /**
     * Kolejnosc = kolejnosc usuwania (wiersze zalezne przed wierszami, na
     * ktore wskazuja; `users` na koncu).
     *
     * @var array<string, array{0: 'all'|'not_kept'|'not_kept_sub', 1: string|null}>
     */
    public const array PURGE = [
        'messages' => ['all', null],
        'message_threads' => ['all', null],
        'supervision_cases' => ['all', null],
        'help_messages' => ['all', null],
        'instructor_questions' => ['all', null],
        'cooperation_requests' => ['all', null],
        'data_exports' => ['all', null],
        'profile_documents' => ['all', null],
        'psychologist_profiles' => ['all', null],
        'documents' => ['all', null],
        'certificates' => ['all', null],
        'workshop_completions' => ['all', null],
        'supervision_signups' => ['all', null],
        'supervision_slots' => ['all', null],
        'supervisor_assignments' => ['all', null],
        'internship_entries' => ['all', null],
        'test_attempts' => ['all', null],
        'lesson_progress' => ['all', null],
        'applications' => ['all', null],
        'access_date_changes' => ['all', null],
        'notifications' => ['all', null],
        'emails' => ['all', null],
        'audit_log' => ['all', null],
        'sensitive_access_log' => ['all', null],
        'sessions' => ['all', null],
        'personal_access_tokens' => ['all', null],
        'password_reset_tokens' => ['all', null],
        'jobs' => ['all', null],
        'job_batches' => ['all', null],
        'failed_jobs' => ['all', null],
        'keycloak_sessions' => ['not_kept_sub', 'sub'],
        'consents' => ['not_kept', 'user_id'],
        'notification_preferences' => ['not_kept', 'user_id'],
        'instructor_profiles' => ['not_kept', 'user_id'],
        'course_assignments' => ['not_kept', 'instructor_id'],
        'users' => ['not_kept', 'id'],
    ];

    /**
     * Kolumny ze sciezka pliku osoby na dysku DISK, w tabelach usuwanych w calosci.
     *
     * @var array<string, string>
     */
    public const array FILE_COLUMNS = [
        'applications' => 'diploma_scan_path',
        'certificates' => 'pdf_path',
        'documents' => 'pdf_path',
        'profile_documents' => 'file_path',
        'data_exports' => 'file_path',
    ];

    /**
     * Czyta liste kont do zachowania z pliku: jeden identyfikator liczbowy na
     * wiersz, puste wiersze i wiersze od `#` pomijane. Komunikat odmowy wskazuje
     * numer wiersza, nigdy jego tresc.
     *
     * @return list<int>
     */
    public static function readKeepList(?string $path): array
    {
        if ($path === null || $path === '') {
            throw new PurgeRefused('Nie podano listy kont do zachowania (--zachowaj=<plik>). Bez listy bieg jest niemozliwy.');
        }

        if (! is_file($path) || ! is_readable($path)) {
            throw new PurgeRefused('Plik listy kont do zachowania nie istnieje albo nie da sie go odczytac.');
        }

        $ids = [];
        $lines = preg_split('/\R/', (string) file_get_contents($path)) ?: [];

        foreach ($lines as $index => $line) {
            $line = trim($line);

            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            if (preg_match('/^[1-9][0-9]{0,18}$/', $line) !== 1) {
                throw new PurgeRefused('Wiersz '.($index + 1).' listy kont nie jest identyfikatorem liczbowym konta.');
            }

            $ids[(int) $line] = true;
        }

        if ($ids === []) {
            throw new PurgeRefused('Lista kont do zachowania jest pusta. Bez listy bieg jest niemozliwy.');
        }

        return array_keys($ids);
    }

    /**
     * Sprawdza liste wobec bazy: kazde konto istnieje, nie jest usuniete ani
     * zanonimizowane, ma role personelu, a wsrod nich jest co najmniej jeden
     * super_admin. Zwraca liczbe kont per rola.
     *
     * @param  list<int>  $keepIds
     * @return array<string, int>
     */
    public static function validateKeepList(array $keepIds): array
    {
        $rows = DB::table('users')->whereIn('id', $keepIds)
            ->get(['id', 'role', 'deleted_at', 'anonymized_at'])
            ->keyBy('id');

        $roles = array_fill_keys(self::STAFF_ROLES, 0);

        foreach ($keepIds as $position => $id) {
            $row = $rows->get($id);
            $number = $position + 1;

            if ($row === null) {
                throw new PurgeRefused("Wpis {$number} listy kont: konto nie istnieje.");
            }

            if ($row->deleted_at !== null || $row->anonymized_at !== null) {
                throw new PurgeRefused("Wpis {$number} listy kont: konto usuniete albo zanonimizowane.");
            }

            if (! in_array($row->role, self::STAFF_ROLES, true)) {
                throw new PurgeRefused("Wpis {$number} listy kont: konto nie ma roli personelu.");
            }

            $roles[$row->role]++;
        }

        if ($roles['super_admin'] < 1) {
            throw new PurgeRefused('Na liscie kont nie ma zadnego konta super_admin - po biegu nikt nie moglby administrowac platforma.');
        }

        return $roles;
    }

    /**
     * Tabele bazy bez kategorii. Pusta lista = kazda tabela jest sklasyfikowana.
     *
     * @return list<string>
     */
    public static function unclassifiedTables(): array
    {
        $known = [...self::CONTENT_TABLES, ...self::COUNTED_TABLES, ...array_keys(self::PURGE)];
        $present = Schema::getTableListing(schemaQualified: false);
        $unknown = array_values(array_diff($present, $known));
        sort($unknown);

        return $unknown;
    }

    /**
     * Plan: dla kazdej istniejacej tabeli liczba wierszy przed, do usuniecia
     * i po. Niczego nie zmienia.
     *
     * @param  list<int>  $keepIds
     * @return array<string, array{category: string, before: int, delete: int, after: int}>
     */
    public static function plan(array $keepIds): array
    {
        $plan = [];

        foreach (self::PURGE as $table => [$mode, $column]) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $before = DB::table($table)->count();
            $delete = self::deletionQuery($table, $mode, $column, $keepIds)->count();
            $plan[$table] = [
                'category' => $mode === 'all' ? 'slad' : 'konto',
                'before' => $before,
                'delete' => $delete,
                'after' => $before - $delete,
            ];
        }

        foreach ([...self::CONTENT_TABLES, ...self::COUNTED_TABLES] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $before = DB::table($table)->count();
            $plan[$table] = [
                'category' => in_array($table, self::COUNTED_TABLES, true) ? 'liczona' : 'tresc',
                'before' => $before,
                'delete' => 0,
                'after' => $before,
            ];
        }

        return $plan;
    }

    /**
     * Sciezki plikow osob wskazywane przez wiersze, ktore bieg usunie.
     *
     * @return list<string>
     */
    public static function filePaths(): array
    {
        $paths = [];

        foreach (self::FILE_COLUMNS as $table => $column) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            foreach (DB::table($table)->whereNotNull($column)->pluck($column) as $path) {
                if (is_string($path) && $path !== '') {
                    $paths[$path] = true;
                }
            }
        }

        return array_keys($paths);
    }

    /**
     * @param  list<string>  $paths
     */
    public static function existingFileCount(array $paths): int
    {
        $disk = Storage::disk(self::DISK);

        return count(array_filter($paths, static fn (string $path): bool => $disk->exists($path)));
    }

    /**
     * Bieg wlasciwy w jednej transakcji. Liczba kont do usuniecia musi byc rowna
     * potwierdzeniu z biegu na sucho; po usunieciu kazda tabela musi miec
     * dokladnie tyle wierszy, ile przewidzial plan - inaczej transakcja jest
     * wycofywana w calosci. Pliki znikaja z dysku dopiero po zatwierdzeniu.
     *
     * @param  list<int>  $keepIds
     * @return array{plan: array<string, array{category: string, before: int, delete: int, after: int}>, files: array{pointed: int, deleted: int, missing: int, failed: int}}
     */
    public static function execute(array $keepIds, int $confirmedUserDeletes): array
    {
        $paths = [];

        $plan = DB::transaction(function () use ($keepIds, $confirmedUserDeletes, &$paths): array {
            self::refuseWhenProductionStarted();
            self::refuseWithoutRestoreTrial();
            self::validateKeepList($keepIds);
            $plan = self::plan($keepIds);

            $usersToDelete = $plan['users']['delete'];
            if ($usersToDelete !== $confirmedUserDeletes) {
                throw new PurgeRefused(
                    "Potwierdzenie ({$confirmedUserDeletes}) nie zgadza sie z liczba kont do usuniecia ({$usersToDelete}). Uruchom bieg na sucho jeszcze raz.",
                );
            }

            $paths = self::filePaths();

            // Blokada dziennikow otwarta wylacznie na te transakcje.
            AuditTablesLock::allowPurgeInCurrentTransaction();

            foreach (self::PURGE as $table => [$mode, $column]) {
                if (! isset($plan[$table])) {
                    continue;
                }

                self::deletionQuery($table, $mode, $column, $keepIds)->delete();
            }

            foreach ($plan as $table => $row) {
                $now = DB::table($table)->count();

                if ($now !== $row['after']) {
                    throw new RuntimeException(
                        "Tabela {$table}: po biegu {$now} wierszy, plan przewidywal {$row['after']}. Transakcja wycofana.",
                    );
                }
            }

            // Pierwszy wpis dziennika produkcji i znacznik startu: w tej samej transakcji.
            $entry = AuditLog::record(null, 'trial_data.purged', null, [
                'deleted' => array_map(static fn (array $row): int => $row['delete'], array_intersect_key($plan, self::PURGE)),
                'kept_accounts' => count($keepIds),
                'executor' => self::EXECUTOR,
            ]);
            ProductionStart::record($entry->created_at);

            return $plan;
        });

        $disk = Storage::disk(self::DISK);
        $files = ['pointed' => count($paths), 'deleted' => 0, 'missing' => 0, 'failed' => 0];

        foreach ($paths as $path) {
            if (! $disk->exists($path)) {
                $files['missing']++;

                continue;
            }

            if ($disk->delete($path)) {
                $files['deleted']++;
            } else {
                $files['failed']++;
            }
        }

        return ['plan' => $plan, 'files' => $files];
    }

    /**
     * Odmowa, gdy znacznik startu produkcji juz stoi: czyszczenie jest jednorazowe.
     */
    public static function refuseWhenProductionStarted(): void
    {
        if (ProductionStart::isRecorded()) {
            throw new PurgeRefused('Przejscie zostalo juz wykonane (znacznik startu produkcji istnieje). Czyszczenie jest jednorazowe - kazdy kolejny bieg, takze na sucho, jest odmowiony.');
        }
    }

    /**
     * Ostatnia linia wyniku skryptu odtworzenia probnego (deploy/prod/odtworzenie-probne.sh)
     * po udanym odtworzeniu, gdy wszystkie liczby wierszy sa zgodne.
     */
    public const string RESTORE_OK_LINE = 'odtworzenie probne: OK, wszystkie liczby wierszy zgodne';

    /**
     * Odmowa, gdy krok 3 procedury (odtworzenie probne kopii) nie zostawil znacznika.
     */
    public static function refuseWithoutRestoreTrial(): void
    {
        if (! RestoreTrial::isRecorded()) {
            throw new PurgeRefused('Brak potwierdzonego odtworzenia probnego kopii (krok 3 procedury). Zapisz wynik: --zapisz-odtworzenie=<plik wyniku odtworzenia>.');
        }
    }

    /**
     * Zapisuje znacznik odtworzenia probnego, ale tylko gdy plik wyniku skryptu
     * odtworzenia dowodzi sukcesu: ostatnia niepusta linia to dokladnie
     * RESTORE_OK_LINE, a zadna linia nie niesie slowa NIEZGODNOSC. Odmowa nie
     * cytuje tresci pliku ani jego sciezki. Po starcie produkcji odmawia.
     */
    public static function confirmRestoreTrial(?string $path): void
    {
        self::refuseWhenProductionStarted();

        if ($path === null || $path === '') {
            throw new PurgeRefused('Nie podano pliku wyniku odtworzenia probnego (--zapisz-odtworzenie=<plik>).');
        }

        if (! is_file($path) || ! is_readable($path) || filesize($path) > 1_048_576) {
            throw new PurgeRefused('Plik wyniku odtworzenia nie istnieje, nie da sie go odczytac albo jest za duzy.');
        }

        $lines = array_values(array_filter(
            array_map('trim', preg_split('/\R/', (string) file_get_contents($path)) ?: []),
            static fn (string $line): bool => $line !== '',
        ));

        foreach ($lines as $line) {
            if (str_contains($line, 'NIEZGODNOSC')) {
                throw new PurgeRefused('Wynik odtworzenia probnego wskazuje niezgodnosc liczb wierszy. Najpierw nowa kopia i nowe odtworzenie.');
            }
        }

        if ($lines === [] || $lines[array_key_last($lines)] !== self::RESTORE_OK_LINE) {
            throw new PurgeRefused('Wynik odtworzenia probnego nie konczy sie potwierdzeniem sukcesu. Odtworzenie nie jest udane.');
        }

        RestoreTrial::record();
    }

    /**
     * Stan po biegu, czytany z bazy: czy stoi znacznik i jaki jest pierwszy wpis dziennika.
     *
     * @return array{marker: bool, first_entry: string|null}
     */
    public static function startState(): array
    {
        $first = DB::table('audit_log')->orderBy('id')->value('action');

        return [
            'marker' => ProductionStart::isRecorded(),
            'first_entry' => is_string($first) ? $first : null,
        ];
    }

    /**
     * Tabele sladow osob: kazda tabela usuwana w calosci poza dwoma dziennikami.
     *
     * @return list<string>
     */
    public static function traceTables(): array
    {
        $tables = [];

        foreach (self::PURGE as $table => [$mode]) {
            if ($mode === 'all' && ! in_array($table, self::JOURNALS, true) && Schema::hasTable($table)) {
                $tables[] = $table;
            }
        }

        return $tables;
    }

    /**
     * Pomiar stanu po przejsciu (opcja --sprawdz). Niczego nie zmienia: proba
     * dziennikow idzie w transakcji, ktora jest zawsze wycofywana.
     *
     * @return array{
     *     marker: bool,
     *     restore: bool,
     *     participants: int,
     *     trace_tables_not_empty: list<string>,
     *     audit_rows: int,
     *     audit_first: string|null,
     *     access_rows: int,
     *     probe: array{usuniecie: string, zmiana: string, oproznienie: string, dopisanie: string},
     *     passed: bool
     * }
     */
    public static function verify(): array
    {
        $notEmpty = [];
        foreach (self::traceTables() as $table) {
            if (DB::table($table)->exists()) {
                $notEmpty[] = $table;
            }
        }

        $state = self::startState();
        $probe = self::probeJournalLock();
        $participants = DB::table('users')->whereNotIn('role', self::STAFF_ROLES)->count();
        $auditRows = DB::table('audit_log')->count();
        $accessRows = DB::table('sensitive_access_log')->count();

        $restore = RestoreTrial::isRecorded();

        $passed = $state['marker']
            && $restore
            && $participants === 0
            && $notEmpty === []
            && $auditRows === 1
            && $state['first_entry'] === 'trial_data.purged'
            && $accessRows === 0
            && $probe === ['usuniecie' => 'odmowa', 'zmiana' => 'odmowa', 'oproznienie' => 'odmowa', 'dopisanie' => 'dziala'];

        return [
            'marker' => $state['marker'],
            'restore' => $restore,
            'participants' => $participants,
            'trace_tables_not_empty' => $notEmpty,
            'audit_rows' => $auditRows,
            'audit_first' => $state['first_entry'],
            'access_rows' => $accessRows,
            'probe' => $probe,
            'passed' => $passed,
        ];
    }

    /**
     * Proba blokady dziennikow: usuniecie, zmiana i oproznienie kazdego z dwoch
     * dziennikow musza byc odmowione przez baze, dopisanie musi przejsc. Wszystko
     * w jednej transakcji, ktora jest wycofywana zawsze - po probie w dzienniku
     * nie zostaje nic. Kazde polecenie ma wlasny punkt zapisu, bo odmowa bazy
     * psuje transakcje, w ktorej padla.
     *
     * @return array{usuniecie: string, zmiana: string, oproznienie: string, dopisanie: string}
     */
    private static function probeJournalLock(): array
    {
        $result = ['usuniecie' => 'odmowa', 'zmiana' => 'odmowa', 'oproznienie' => 'odmowa', 'dopisanie' => 'dziala'];
        $statements = [
            'usuniecie' => 'delete from %s',
            'zmiana' => 'update %s set id = id',
            'oproznienie' => 'truncate %s',
        ];

        DB::beginTransaction();

        try {
            foreach ($statements as $name => $template) {
                foreach (self::JOURNALS as $table) {
                    if (! self::refusedByLock(sprintf($template, $table))) {
                        $result[$name] = 'dziala';
                    }
                }
            }

            $viewer = DB::table('users')->min('id');
            $inserts = [
                static fn () => DB::table('audit_log')->insert(['action' => 'trial_data.purged', 'created_at' => now()]),
                static fn () => DB::table('sensitive_access_log')->insert(['viewer_id' => $viewer, 'file_type' => 'proba', 'file_id' => 0, 'viewed_at' => now()]),
            ];
            foreach ($inserts as $insert) {
                try {
                    DB::transaction($insert);
                } catch (QueryException) {
                    $result['dopisanie'] = 'odmowa';
                }
            }
        } finally {
            DB::rollBack();
        }

        return $result;
    }

    private static function refusedByLock(string $sql): bool
    {
        try {
            DB::transaction(static fn () => DB::statement($sql));
        } catch (QueryException $e) {
            return str_contains($e->getMessage(), 'audit tables lock');
        }

        return false;
    }

    /**
     * Konta spoza listy, ktore sa w bazie teraz (takze usuniete miekko).
     *
     * @param  list<int>  $keepIds
     */
    public static function remainingProbeAccounts(array $keepIds): int
    {
        return DB::table('users')->whereNotIn('id', $keepIds)->count();
    }

    /**
     * @param  'all'|'not_kept'|'not_kept_sub'  $mode
     * @param  list<int>  $keepIds
     */
    private static function deletionQuery(string $table, string $mode, ?string $column, array $keepIds): Builder
    {
        $query = DB::table($table);

        return match ($mode) {
            'all' => $query,
            'not_kept' => $query->whereNotIn((string) $column, $keepIds),
            'not_kept_sub' => $query->whereNotIn(
                (string) $column,
                DB::table('users')->whereIn('id', $keepIds)->whereNotNull('keycloak_sub')->select('keycloak_sub'),
            ),
        };
    }
}
