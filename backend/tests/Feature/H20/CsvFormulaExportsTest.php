<?php

namespace Tests\Feature\H20;

use App\Models\Application;
use App\Models\Edition;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Eksporty CSV administracji a imię i nazwisko ustawione przez samą osobę.
 *
 * Każda zalogowana rola zmienia własne imię i nazwisko przez `PATCH /me`
 * (tekst do 255 znaków, bez wzorca), a administracja otwiera potem eksport
 * w arkuszu: komórka zaczynająca się od `=`, `+`, `-` albo `@` jest tam
 * formułą. Wszystkie asercje są na surowych bajtach odpowiedzi.
 *
 * Kolumny, w które trafia imię i nazwisko: `osoby.csv` (`first_name`,
 * `last_name`), `raport.csv` (`first_name`, `last_name`) i `dziennik.csv`
 * (`actor_name` — imię i nazwisko sprawcy zdarzenia w jednej komórce).
 * `raport-grantodawcy.csv` niesie same liczby, więc nie ma tam czego
 * neutralizować; jego test pilnuje, że plik pozostaje bajt w bajt taki, jaki był.
 */
class CsvFormulaExportsTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string FIRST_NAME = '=HYPERLINK("x")';

    private const string LAST_NAME = '@SUM(1)';

    private const string EMAIL = 'formuly.test@example.test';

    public function test_people_export_neutralises_a_name_set_through_the_profile(): void
    {
        $person = $this->personWithFormulaName();
        $this->actingAsAdministration();

        $body = $this->get('/api/v1/admin/users/export.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString(
            $person->id.';"\'=HYPERLINK(""x"")";\'@SUM(1);'.self::EMAIL.';volunteer;',
            $body,
            'Imię i nazwisko z formułą wyszło z eksportu osób bez apostrofu.',
        );
        $this->assertStringNotContainsString('"=HYPERLINK(', $body);
        $this->assertStringNotContainsString(';@SUM(1);', $body);
    }

    public function test_report_export_neutralises_a_name_set_through_the_profile(): void
    {
        $person = $this->personWithFormulaName();
        $this->actingAsAdministration();

        $body = $this->get('/api/v1/admin/report/export.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString(
            $person->id.';"\'=HYPERLINK(""x"")";\'@SUM(1);volunteer;0;0;0'."\n",
            $body,
            'Imię i nazwisko z formułą wyszło z raportu bez apostrofu.',
        );
        $this->assertStringNotContainsString('"=HYPERLINK(', $body);
        $this->assertStringNotContainsString(';@SUM(1);', $body);
    }

    public function test_audit_export_neutralises_the_actor_name(): void
    {
        $person = $this->personWithFormulaName();
        AuditLog::record($person, 'user.updated', $person);
        $this->actingAsAdministration();

        $body = $this->get('/api/v1/admin/audit/export.csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString(
            ';user.updated;'.$person->id.';"\'=HYPERLINK(""x"") @SUM(1)";',
            $body,
            'Sprawca zdarzenia z formułą w nazwie wyszedł z dziennika bez apostrofu.',
        );
        $this->assertStringNotContainsString('"=HYPERLINK(', $body);
    }

    public function test_grantor_report_export_stays_byte_for_byte_the_same(): void
    {
        $edition = Edition::factory()->create();
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-03-10']);

        $this->actingAsRole('super_admin');

        $body = $this->get('/api/v1/admin/report/grantor/export.csv?from=2026-03-01&to=2026-03-31')
            ->assertOk()
            ->streamedContent();

        $this->assertSame(
            "\xEF\xBB\xBF"
            ."wskaznik;wartosc\n"
            ."participants_by_status.accepted;1\n"
            ."participants_by_status.in_program;0\n"
            ."participants_by_status.completed;0\n"
            ."participants_by_status.removed;0\n"
            ."tests_passed_total;0\n"
            ."certificates_issued_total;0\n"
            ."supervisions_confirmed_total;0\n",
            $body,
        );
    }

    /**
     * Wolontariuszka ustawia sobie imię i nazwisko własnym `PATCH /me` —
     * dokładnie tą drogą, którą dostaje się do eksportu każda rola.
     */
    private function personWithFormulaName(): User
    {
        $this->seed();

        $person = User::factory()->role('volunteer')->create(['email' => self::EMAIL]);

        $this->actingAs($person, 'keycloak');
        $this->patchJson('/api/v1/me', [
            'first_name' => self::FIRST_NAME,
            'last_name' => self::LAST_NAME,
        ])->assertOk();

        $this->app['auth']->forgetGuards();

        return $person->fresh();
    }

    private function actingAsAdministration(): void
    {
        $this->actingAs(User::where('email', 'admin@demo.pl')->firstOrFail(), 'keycloak');
    }
}
