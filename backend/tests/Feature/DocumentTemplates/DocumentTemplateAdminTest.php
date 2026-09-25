<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\DocumentTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Edytor wzorow dokumentow (zaplecze) - kryteria akceptacji galezi
 * `chmura/wzory-dokumentow-zaplecze`:
 *   - administracja zmienia wzor porozumienia / zaswiadczenia / certyfikatu
 *     (PUT -> 200, version +1);
 *   - rola: 403 dla roli spoza `project_manager,super_admin`;
 *   - wersjonowanie: dwa zapisy dają dwa wpisy historii.
 */
class DocumentTemplateAdminTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private function seedTemplate(string $type = 'agreement', string $content = 'Tresc poczatkowa.'): DocumentTemplate
    {
        return DocumentTemplate::create([
            'type' => $type,
            'content' => $content,
            'version' => 1,
            'updated_by' => null,
        ]);
    }

    public function test_guest_is_unauthenticated_on_show(): void
    {
        $this->seedTemplate();

        $this->getJson('/api/v1/document-templates/agreement')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_volunteer_is_forbidden(): void
    {
        $this->seedTemplate();
        $this->actingAsRole('volunteer');

        $this->getJson('/api/v1/document-templates/agreement')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_student_is_forbidden_on_update(): void
    {
        $this->seedTemplate();
        $this->actingAsRole('student');

        $this->putJson('/api/v1/document-templates/agreement', ['content' => 'Nowa tresc.'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_unknown_type_is_not_found(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/document-templates/nieznany')
            ->assertStatus(404);
    }

    public function test_project_manager_reads_the_current_template(): void
    {
        $this->seedTemplate('agreement', 'Tresc porozumienia.');
        $this->actingAsRole('project_manager');

        $this->getJson('/api/v1/document-templates/agreement')
            ->assertOk()
            ->assertJsonPath('data.type', 'agreement')
            ->assertJsonPath('data.content', 'Tresc porozumienia.')
            ->assertJsonPath('data.version', 1);
    }

    /** Kryterium: administracja zmienia wzor porozumienia. */
    public function test_admin_updates_the_agreement_template_and_bumps_the_version(): void
    {
        $this->seedTemplate('agreement');
        $admin = $this->actingAsRole('super_admin');

        $response = $this->putJson('/api/v1/document-templates/agreement', [
            'content' => 'Nowa tresc porozumienia.',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.content', 'Nowa tresc porozumienia.')
            ->assertJsonPath('data.updated_by.id', $admin->id);

        $this->assertDatabaseHas('document_templates', [
            'type' => 'agreement',
            'content' => 'Nowa tresc porozumienia.',
            'version' => 2,
            'updated_by' => $admin->id,
        ]);
    }

    /** Kryterium: wzor zaswiadczenia. */
    public function test_admin_updates_the_attendance_certificate_template_and_bumps_the_version(): void
    {
        $this->seedTemplate('attendance_certificate');
        $this->actingAsRole('project_manager');

        $this->putJson('/api/v1/document-templates/attendance_certificate', [
            'content' => 'Nowa tresc zaswiadczenia.',
        ])
            ->assertOk()
            ->assertJsonPath('data.version', 2);

        $this->assertDatabaseHas('document_templates', [
            'type' => 'attendance_certificate',
            'version' => 2,
        ]);
    }

    /** Kryterium: wzor certyfikatu. */
    public function test_admin_updates_the_certificate_template_and_bumps_the_version(): void
    {
        $this->seedTemplate('certificate');
        $this->actingAsRole('super_admin');

        $this->putJson('/api/v1/document-templates/certificate', [
            'content' => 'Nowa tresc certyfikatu.',
        ])
            ->assertOk()
            ->assertJsonPath('data.version', 2);

        $this->assertDatabaseHas('document_templates', [
            'type' => 'certificate',
            'version' => 2,
        ]);
    }

    public function test_empty_content_is_rejected_with_a_message_on_the_content_field(): void
    {
        $this->seedTemplate('agreement');
        $this->actingAsRole('super_admin');

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => '']);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.content.0', fn (string $message): bool => $message !== '');

        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 1]);
    }

    /** Kryterium: wersjonowanie - dwa zapisy dają dwa wpisy historii. */
    public function test_two_updates_produce_two_history_entries(): void
    {
        $template = $this->seedTemplate('agreement');
        $this->actingAsRole('super_admin');

        $before = $template->versions()->count();

        $this->putJson('/api/v1/document-templates/agreement', ['content' => 'Wersja druga.'])
            ->assertOk();
        $this->putJson('/api/v1/document-templates/agreement', ['content' => 'Wersja trzecia.'])
            ->assertOk();

        $this->assertSame($before + 2, $template->versions()->count());

        $this->getJson('/api/v1/document-templates/agreement/versions')
            ->assertOk()
            ->assertJsonPath('data.0.version', 3)
            ->assertJsonPath('data.1.version', 2);
    }

    public function test_versions_route_is_forbidden_for_a_disallowed_role(): void
    {
        $this->seedTemplate('agreement');
        $this->actingAsRole('instructor');

        $this->getJson('/api/v1/document-templates/agreement/versions')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }
}
