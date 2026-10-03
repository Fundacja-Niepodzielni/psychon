<?php

namespace Tests\Feature\Cutover;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Co zostaje przy koncie personelu z listy po pelnym czyszczeniu
 * (`psychon:zero-danych-probnych --wykonaj --potwierdz`).
 *
 * Zamierzone zachowanie, zapisane w deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md (§3):
 * konto z listy zostaje razem z sześcioma pozycjami, które opisują samą osobę
 * albo jej rolę w programie - wierszem konta, zgodami na dokumenty prawne,
 * preferencjami powiadomień, profilem prowadzącego, przypisaniami prowadzącego
 * do kursów i zapisem sesji SSO. Te same tabele dla konta spoza listy (także
 * konta personelu) są wyczyszczone w całości.
 *
 * Nazwy tabel są wymienione w tym pliku wprost, a nie brane z klasy polecenia:
 * przesunięcie tabeli do usuwanych w całości ma zapalić tę próbę, a nie
 * przesunąć się razem z klasą.
 */
class ZeroDanychProbnychKontaPersoneluTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Tabela => [kolumna wskazująca właściciela wiersza, kolumna kolejności].
     * Dla sesji SSO właścicielem jest identyfikator tożsamości (`sub`), nie `users.id`.
     */
    private const array OWNED_TABLES = [
        'users' => ['id', 'id'],
        'consents' => ['user_id', 'id'],
        'notification_preferences' => ['user_id', 'id'],
        'instructor_profiles' => ['user_id', 'id'],
        'course_assignments' => ['instructor_id', 'id'],
        'keycloak_sessions' => ['sub', 'sid'],
    ];

    private const string RESTORE_OK = "odtworzenie: tabela users = 7 wierszy (zgodne)\nodtworzenie probne: OK, wszystkie liczby wierszy zgodne\n";

    /** @var list<int> */
    private array $keepIds = [];

    /** @var list<int> konta personelu spoza listy */
    private array $probeIds = [];

    /** @var list<string> */
    private array $keepSubs = [];

    /** @var list<string> */
    private array $probeSubs = [];

    private string $keepFile = '';

    /** @var list<string> */
    private array $ownFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->seed();

        $keep = [
            User::query()->where('role', 'super_admin')->firstOrFail(),
            User::query()->where('role', 'project_manager')->firstOrFail(),
            User::query()->where('role', 'instructor')->firstOrFail(),
        ];
        $probe = [
            User::factory()->create(['role' => 'project_manager', 'first_name' => 'Personel', 'last_name' => 'Probny']),
            User::factory()->create(['role' => 'instructor', 'first_name' => 'Prowadzacy', 'last_name' => 'Probny']),
        ];

        foreach ([...$keep, ...$probe] as $user) {
            $user->forceFill(['keycloak_sub' => (string) Str::uuid()])->save();
        }

        $this->keepIds = array_map(static fn (User $user): int => $user->id, $keep);
        $this->probeIds = array_map(static fn (User $user): int => $user->id, $probe);
        $this->keepSubs = array_map(static fn (User $user): string => (string) $user->keycloak_sub, $keep);
        $this->probeSubs = array_map(static fn (User $user): string => (string) $user->keycloak_sub, $probe);

        $this->seedOwnedRows($keep, $probe);

        $this->keepFile = $this->writeFile("# konta personelu\n".implode("\n", $this->keepIds)."\n");
        $code = Artisan::call('psychon:zero-danych-probnych', ['--zapisz-odtworzenie' => $this->writeFile(self::RESTORE_OK)]);
        $this->assertSame(0, $code, Artisan::output());
    }

    protected function tearDown(): void
    {
        foreach ($this->ownFiles as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }

        parent::tearDown();
    }

    public function test_a_listed_staff_account_keeps_every_row_of_the_six_kept_tables(): void
    {
        $before = $this->rowsOf($this->keepIds, $this->keepSubs);

        foreach ($this->keepIds as $id) {
            foreach (['users', 'consents', 'notification_preferences', 'keycloak_sessions'] as $table) {
                $this->assertGreaterThan(0, $this->countFor($table, $this->ownerOf($table, $id)), "{$table}: konto {$id} z listy ma miec wiersze przed biegiem");
            }
        }
        foreach (self::OWNED_TABLES as $table => $_) {
            $this->assertNotEmpty($before[$table], "{$table}: proba nie ma czego pilnowac - brak wierszy kont z listy przed biegiem");
        }

        $this->runPurge();

        $after = $this->rowsOf($this->keepIds, $this->keepSubs);

        foreach (self::OWNED_TABLES as $table => $_) {
            $this->assertCount(count($before[$table]), $after[$table], "{$table}: liczba wierszy kont z listy przed i po biegu");
            $this->assertSame($before[$table], $after[$table], "{$table}: wiersze kont z listy maja zostac bez zmian");
        }

        // Kazde konto z listy zachowuje kazda ze swoich zgod, preferencji i sesji, nie tylko "cos" w tabeli.
        foreach ($this->keepIds as $id) {
            $this->assertSame(1, DB::table('consents')->where('user_id', $id)->where('type', 'regulamin')->where('document_version', 'v-proba-'.$id)->count(), "konto {$id}: zgoda na dokument");
            $this->assertSame(1, DB::table('consents')->where('user_id', $id)->where('type', 'marketing')->whereNull('document_version')->count(), "konto {$id}: zgoda bez wersji");
            $this->assertSame(1, DB::table('notification_preferences')->where('user_id', $id)->where('type', 'internship.returned')->count(), "konto {$id}: preferencje powiadomien");
            $this->assertSame(1, DB::table('keycloak_sessions')->where('sid', 'sesja-proby-'.$id)->count(), "konto {$id}: sesja SSO");
        }
        $instructorId = (int) User::query()->whereIn('id', $this->keepIds)->where('role', 'instructor')->value('id');
        $this->assertSame(1, DB::table('instructor_profiles')->where('user_id', $instructorId)->count(), 'profil prowadzacego z listy');
        $this->assertGreaterThan(0, DB::table('course_assignments')->where('instructor_id', $instructorId)->count(), 'przypisania prowadzacego z listy');
    }

    public function test_the_same_tables_are_emptied_for_staff_accounts_outside_the_list(): void
    {
        $before = $this->rowsOf($this->probeIds, $this->probeSubs);
        $outsideBefore = $this->outsideTheList();

        foreach (self::OWNED_TABLES as $table => $_) {
            $this->assertNotEmpty($before[$table], "{$table}: konto personelu spoza listy ma miec wiersze przed biegiem");
        }

        $this->runPurge();

        $after = $this->rowsOf($this->probeIds, $this->probeSubs);

        foreach (self::OWNED_TABLES as $table => $_) {
            $this->assertSame([], $after[$table], "{$table}: wiersze konta spoza listy maja zniknac");
        }

        // Nie tylko dwa konta z proby: nic nie zostaje po zadnym koncie spoza listy.
        foreach ($outsideBefore as $table => $count) {
            $this->assertGreaterThan(0, $count, "{$table}: przed biegiem sa wiersze kont spoza listy");
        }
        foreach (self::OWNED_TABLES as $table => [$owner]) {
            $values = $table === 'keycloak_sessions' ? $this->keepSubs : $this->keepIds;
            $this->assertSame(0, DB::table($table)->whereNotIn($owner, $values)->count(), "{$table}: nic poza kontami z listy");
        }
    }

    /**
     * Pelne czyszczenie: --wykonaj razem z --potwierdz rownym liczbie kont do usuniecia.
     */
    private function runPurge(): void
    {
        $toDelete = DB::table('users')->whereNotIn('id', $this->keepIds)->count();
        $this->assertGreaterThan(0, $toDelete);

        $code = Artisan::call('psychon:zero-danych-probnych', [
            '--zachowaj' => $this->keepFile,
            '--wykonaj' => true,
            '--potwierdz' => (string) $toDelete,
        ]);

        $output = Artisan::output();

        $this->assertSame(0, $code, $output);
        $this->assertMatchesRegularExpression('/^WYNIK BIEG_WLASCIWY usunieto_kont='.$toDelete.' osob_spoza_listy_po=0$/m', $output);
    }

    /**
     * Wiersze wskazanych kont, po tabeli, w stalej kolejnosci; kazdy wiersz jako napis JSON.
     *
     * @param  list<int>  $ids
     * @param  list<string>  $subs
     * @return array<string, list<string>>
     */
    private function rowsOf(array $ids, array $subs): array
    {
        $rows = [];

        foreach (self::OWNED_TABLES as $table => [$owner, $order]) {
            $values = $table === 'keycloak_sessions' ? $subs : $ids;
            $rows[$table] = DB::table($table)->whereIn($owner, $values)->orderBy($order)->get()
                ->map(static fn (object $row): string => (string) json_encode($row, JSON_THROW_ON_ERROR))->all();
        }

        return $rows;
    }

    /**
     * @return array<string, int>
     */
    private function outsideTheList(): array
    {
        $counts = [];

        foreach (self::OWNED_TABLES as $table => [$owner]) {
            $values = $table === 'keycloak_sessions' ? $this->keepSubs : $this->keepIds;
            $counts[$table] = DB::table($table)->whereNotIn($owner, $values)->count();
        }

        return $counts;
    }

    /**
     * @return array{0: string, 1: int|string}
     */
    private function ownerOf(string $table, int $id): array
    {
        $column = self::OWNED_TABLES[$table][0];

        if ($table === 'keycloak_sessions') {
            return [$column, (string) User::query()->whereKey($id)->value('keycloak_sub')];
        }

        return [$column, $id];
    }

    /**
     * @param  array{0: string, 1: int|string}  $owner
     */
    private function countFor(string $table, array $owner): int
    {
        return DB::table($table)->where($owner[0], $owner[1])->count();
    }

    /**
     * Wiersze fazy testowej dla kazdego konta personelu: zgody, preferencje, sesja;
     * profil i przypisania - dla prowadzacych (z listy i spoza niej).
     *
     * @param  list<User>  $keep
     * @param  list<User>  $probe
     */
    private function seedOwnedRows(array $keep, array $probe): void
    {
        $courseId = (int) DB::table('courses')->min('id');
        $now = now();

        foreach ([...$keep, ...$probe] as $user) {
            DB::table('consents')->insert([
                ['user_id' => $user->id, 'type' => 'regulamin', 'document_version' => 'v-proba-'.$user->id, 'granted_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['user_id' => $user->id, 'type' => 'marketing', 'document_version' => null, 'granted_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ]);
            DB::table('notification_preferences')->insert([
                'user_id' => $user->id, 'type' => 'internship.returned', 'email' => false, 'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('keycloak_sessions')->insert([
                'sid' => 'sesja-proby-'.$user->id, 'sub' => (string) $user->keycloak_sub, 'created_at' => $now,
            ]);

            if ($user->role === 'instructor') {
                DB::table('instructor_profiles')->updateOrInsert(
                    ['user_id' => $user->id],
                    ['city' => 'Miasto probne', 'bio' => 'Opis probny.', 'created_at' => $now, 'updated_at' => $now],
                );
                DB::table('course_assignments')->insert([
                    'course_id' => $courseId, 'lesson_id' => null, 'instructor_id' => $user->id, 'assigned_at' => $now, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    private function writeFile(string $content): string
    {
        $path = tempnam(sys_get_temp_dir(), 'zachowaj-probny-');
        $this->assertIsString($path);
        file_put_contents($path, $content);
        $this->ownFiles[] = $path;

        return $path;
    }
}
