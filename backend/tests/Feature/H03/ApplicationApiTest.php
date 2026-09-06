<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\SensitiveAccessLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_and_create_an_application(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $actor = User::factory()->role('project_manager')->create();
        $application = Application::factory()->create(['edition_id' => $edition->id]);
        Sanctum::actingAs($actor);

        $this->getJson('/api/v1/admin/applications')
            ->assertOk()
            ->assertJsonPath('data.0.id', $application->id)
            ->assertJsonPath('meta.edition_id', $edition->id)
            ->assertJsonPath('meta.current_page', 1);

        $this->postJson('/api/v1/admin/applications', [
            'first_name' => 'Anna',
            'last_name' => 'Demo',
            'email' => '  Anna.Demo@Example.Test ',
            'role' => 'volunteer',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.email', 'anna.demo@example.test')
            ->assertJsonPath('data.user_id', null);
    }

    public function test_create_and_accept_validate_contract_fields(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create();
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->postJson('/api/v1/admin/applications', ['email' => 'not-an-email'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['first_name', 'last_name', 'email']]]);

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'owner'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['role']]]);
    }

    public function test_application_routes_require_administrative_authorization(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create();

        $this->getJson('/api/v1/admin/applications')->assertUnauthorized();

        Sanctum::actingAs(User::factory()->role('volunteer')->create());
        $this->getJson('/api/v1/admin/applications')->assertForbidden();
        $this->postJson('/api/v1/admin/applications/'.$application->id.'/reject', ['reason' => 'x'])->assertForbidden();
    }

    public function test_every_non_admin_role_is_forbidden_from_the_queue(): void
    {
        Edition::factory()->create(['status' => 'active']);

        foreach (['student', 'volunteer', 'instructor'] as $role) {
            Sanctum::actingAs(User::factory()->role($role)->create());
            $this->getJson('/api/v1/admin/applications')->assertForbidden();
        }
    }

    public function test_both_administrative_roles_can_access_the_queue_and_all_h03_routes_are_protected(): void
    {
        Edition::factory()->create(['status' => 'active']);

        foreach (['project_manager', 'super_admin'] as $role) {
            Sanctum::actingAs(User::factory()->role($role)->create());
            $this->getJson('/api/v1/admin/applications')->assertOk();
        }

        $routes = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn ($route): bool => str_starts_with($route->uri(), 'api/v1/admin/applications'));

        $this->assertCount(7, $routes);
        $routes->each(function ($route): void {
            $middleware = $route->gatherMiddleware();
            $this->assertContains('auth:sanctum', $middleware);
            $this->assertContains('role:project_manager,super_admin', $middleware);
        });
    }

    public function test_project_manager_cannot_grant_super_admin_role(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create();
        Sanctum::actingAs(User::factory()->role('project_manager')->create());

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'super_admin'])
            ->assertForbidden();
    }

    public function test_application_isolated_to_the_active_edition(): void
    {
        $active = Edition::factory()->create(['status' => 'active']);
        $closed = Edition::factory()->create(['status' => 'closed']);
        $visible = Application::factory()->create(['edition_id' => $active->id]);
        $hidden = Application::factory()->create(['edition_id' => $closed->id]);
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->getJson('/api/v1/admin/applications')->assertOk()
            ->assertJsonPath('data.0.id', $visible->id)
            ->assertJsonMissing(['id' => $hidden->id]);
        $this->getJson('/api/v1/admin/applications/'.$hidden->id)->assertNotFound();
    }

    public function test_accept_creates_invited_user_audit_notification_and_activation_flow(): void
    {
        $edition = Edition::factory()->create(['status' => 'active', 'seats_limit' => 5]);
        $application = Application::factory()->create([
            'edition_id' => $edition->id,
            'email' => 'candidate@example.test',
        ]);
        $actor = User::factory()->role('project_manager')->create();
        Sanctum::actingAs($actor);

        $response = $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', [
            'role' => 'volunteer',
        ])->assertCreated()
            ->assertJsonStructure(['data' => ['user_id', 'access_expires_at']]);

        $user = User::findOrFail($response->json('data.user_id'));
        $this->assertSame('candidate@example.test', $user->email);
        $this->assertNull($user->password);
        $this->assertNotNull($user->activation_token);
        $this->assertTrue($user->access_expires_at->greaterThan(now()->addMonths(5)));
        $this->assertSame('accepted', $application->fresh()->status);
        $this->assertDatabaseHas('audit_log', ['action' => 'application.accepted', 'subject_id' => $application->id]);
        $this->assertDatabaseHas('notifications', ['user_id' => $user->id, 'type' => 'application.accepted']);
        $this->assertDatabaseHas('emails', ['to_user_id' => $user->id, 'status' => 'simulated']);
        $this->assertStringContainsString(
            $user->activation_token,
            (string) EmailMessage::where('to_user_id', $user->id)->latest('id')->value('body_html'),
        );
        $this->assertStringContainsString(
            rtrim(config('app.frontend_url'), '/').'/aktywacja?token=',
            (string) EmailMessage::where('to_user_id', $user->id)->latest('id')->value('body_html'),
        );

        $this->postJson('/api/v1/auth/activate', [
            'token' => $user->activation_token,
            'password' => 'NoweHaslo123',
        ])->assertOk();
        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'NoweHaslo123',
        ])->assertOk();
    }

    public function test_duplicate_user_email_is_rejected_without_side_effects(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create(['edition_id' => $edition->id, 'email' => 'existing@example.test']);
        $existing = User::factory()->create(['email' => 'existing@example.test']);
        $actor = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($actor);

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'email_already_registered')
            ->assertJsonPath('error.reason.existing_user_id', $existing->id);

        $this->assertSame('new', $application->fresh()->status);
        $this->assertSame(0, AuditLogEntry::where('action', 'application.accepted')->count());
    }

    public function test_capacity_requires_force_and_force_accepts(): void
    {
        $edition = Edition::factory()->create(['status' => 'active', 'seats_limit' => 1]);
        User::factory()->create(['edition_id' => $edition->id, 'status' => 'active']);
        $application = Application::factory()->create(['edition_id' => $edition->id]);
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'edition_capacity_exceeded')
            ->assertJsonPath('error.reason.capacity', 1)
            ->assertJsonPath('error.reason.active', 1)
            ->assertJsonPath('error.reason.requested', 1);

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', [
            'role' => 'volunteer',
            'force' => true,
        ])->assertCreated();
    }

    public function test_reject_requires_reason_and_emits_audited_notification(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create();
        $actor = User::factory()->role('project_manager')->create();
        Sanctum::actingAs($actor);

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/reject', ['reason' => '  '])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['reason']]]);

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/reject', ['reason' => 'Brak dokumentów.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejection_reason', 'Brak dokumentów.');

        $this->assertDatabaseHas('audit_log', ['action' => 'application.rejected', 'subject_id' => $application->id]);
        $this->assertDatabaseHas('notifications', ['user_id' => $actor->id, 'type' => 'application.rejected']);
        $this->assertDatabaseHas('emails', ['to_user_id' => $actor->id, 'status' => 'simulated']);
        $this->assertSame(0, User::where('email', $application->email)->count());
    }

    public function test_decisions_are_one_shot(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $accepted = Application::factory()->create();
        $rejected = Application::factory()->create();
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->postJson('/api/v1/admin/applications/'.$accepted->id.'/accept', ['role' => 'volunteer'])->assertCreated();
        $this->postJson('/api/v1/admin/applications/'.$accepted->id.'/accept', ['role' => 'volunteer'])
            ->assertStatus(409)->assertJsonPath('error.code', 'application_already_decided');
        $this->postJson('/api/v1/admin/applications/'.$accepted->id.'/reject', ['reason' => 'Za późno'])
            ->assertStatus(409)->assertJsonPath('error.code', 'application_already_decided');

        $this->postJson('/api/v1/admin/applications/'.$rejected->id.'/reject', ['reason' => 'Brak zgody'])->assertOk();
        $this->postJson('/api/v1/admin/applications/'.$rejected->id.'/reject', ['reason' => 'Drugi powód'])
            ->assertStatus(409)->assertJsonPath('error.code', 'application_already_decided');
        $this->postJson('/api/v1/admin/applications/'.$rejected->id.'/accept', ['role' => 'volunteer'])
            ->assertStatus(409)->assertJsonPath('error.code', 'application_already_decided');
    }

    public function test_csv_import_reports_invalid_and_duplicate_rows_without_users(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        Application::factory()->create(['edition_id' => $edition->id, 'email' => 'taken@example.test']);
        User::factory()->create(['email' => 'registered@example.test']);
        Sanctum::actingAs(User::factory()->role('project_manager')->create());

        $csv = UploadedFile::fake()->createWithContent('applications.csv', implode("\n", [
            'first_name,last_name,email,phone',
            'Jan,Kowalski,jan@example.test,+48 500 000 001',
            ',Brak,missing@example.test,',
            'Duplikat,Rekord,taken@example.test,',
            'Konto,JużJest,registered@example.test,',
            'Błędny,Adres,nie-email,',
        ]));

        $this->post('/api/v1/admin/applications/import', ['file' => $csv])
            ->assertOk()
            ->assertJsonPath('data.imported', 1)
            ->assertJsonCount(4, 'data.skipped');

        $this->assertDatabaseHas('applications', ['email' => 'jan@example.test', 'status' => 'new']);
        $this->assertDatabaseMissing('users', ['email' => 'jan@example.test']);
    }

    public function test_import_requires_a_csv_file(): void
    {
        Edition::factory()->create(['status' => 'active']);
        Sanctum::actingAs(User::factory()->role('project_manager')->create());

        $this->postJson('/api/v1/admin/applications/import')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['file']]]);
    }

    public function test_csv_import_accepts_bom_and_semicolon_delimiter_and_skips_invalid_role(): void
    {
        Edition::factory()->create(['status' => 'active']);
        Sanctum::actingAs(User::factory()->role('project_manager')->create());
        $csv = UploadedFile::fake()->createWithContent('applications.csv', "\xEF\xBB\xBFfirst_name;last_name;email;role\nMaria;Demo;maria@example.test;volunteer\nTest;Invalid;invalid@example.test;owner\n");

        $this->post('/api/v1/admin/applications/import', ['file' => $csv])
            ->assertOk()
            ->assertJsonPath('data.imported', 1)
            ->assertJsonPath('data.skipped.0.reason', 'invalid_role');
    }

    public function test_diploma_scan_is_admin_only_and_logged(): void
    {
        Storage::fake('local');
        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create([
            'edition_id' => $edition->id,
            'diploma_scan_path' => 'diplomas/scan.pdf',
        ]);
        Storage::disk('local')->put($application->diploma_scan_path, '%PDF-demo');
        $actor = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($actor);

        $this->get('/api/v1/admin/applications/'.$application->id.'/diploma-scan')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->get('/api/v1/admin/applications/'.$application->id.'/diploma-scan')->assertOk();

        $this->assertDatabaseHas('sensitive_access_log', [
            'viewer_id' => $actor->id,
            'file_type' => 'diploma_scan',
            'file_id' => $application->id,
        ]);
        $this->assertDatabaseHas('audit_log', ['action' => 'sensitive.viewed', 'subject_id' => $application->id]);
        $this->assertSame(2, SensitiveAccessLogEntry::count());
    }

    public function test_missing_diploma_scan_and_non_admin_access_leave_no_log(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create(['diploma_scan_path' => null]);
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->get('/api/v1/admin/applications/'.$application->id.'/diploma-scan')
            ->assertNotFound()
            ->assertJsonPath('error.code', 'diploma_scan_not_found');
        $this->assertSame(0, SensitiveAccessLogEntry::count());

        Sanctum::actingAs(User::factory()->role('student')->create());
        $this->get('/api/v1/admin/applications/'.$application->id.'/diploma-scan')->assertForbidden();
    }
}
