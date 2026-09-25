<?php

namespace Tests\Feature\H11;

use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\InternshipForm;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InternshipFormTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Edition::create([
            'name' => 'Edycja testowa',
            'internship_hours_required' => 72,
            'status' => 'active',
        ]);
    }

    public function test_admin_lists_forms_in_sort_order_including_inactive(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $second = InternshipForm::create(['name' => 'Czat', 'sort_order' => 2]);
        $first = InternshipForm::create(['name' => 'Telefon', 'sort_order' => 1, 'is_active' => false]);

        $this->actingAs($admin, 'keycloak')
            ->getJson('/api/v1/admin/internship/forms')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $first->id)
            ->assertJsonPath('data.0.is_active', false)
            ->assertJsonPath('data.1.id', $second->id);
    }

    public function test_admin_creates_a_form_that_is_active_by_default(): void
    {
        $admin = User::factory()->role('super_admin')->create();

        $this->actingAs($admin, 'keycloak')
            ->postJson('/api/v1/admin/internship/forms', [
                'name' => 'Dyżur stacjonarny',
                'description' => 'Dyżur w punkcie konsultacyjnym.',
                'sort_order' => 3,
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Dyżur stacjonarny')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.sort_order', 3);

        $this->assertDatabaseHas('internship_forms', ['name' => 'Dyżur stacjonarny', 'is_active' => true]);
    }

    public function test_create_rejects_missing_and_duplicate_name(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        InternshipForm::create(['name' => 'Czat']);

        $this->actingAs($admin, 'keycloak')
            ->postJson('/api/v1/admin/internship/forms', [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['name']]]);

        $this->actingAs($admin, 'keycloak')
            ->postJson('/api/v1/admin/internship/forms', ['name' => 'Czat'])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['name']]]);

        $this->assertSame(1, InternshipForm::query()->count());
    }

    public function test_admin_deactivates_and_renames_a_form_without_deleting_it(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $form = InternshipForm::create(['name' => 'Czat']);

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/internship/forms/{$form->id}", [
                'name' => 'Czat wsparcia',
                'is_active' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Czat wsparcia')
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('internship_forms', ['id' => $form->id, 'is_active' => false]);
    }

    public function test_update_of_unknown_form_is_404_and_there_is_no_delete_route(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $form = InternshipForm::create(['name' => 'Czat']);

        $this->actingAs($admin, 'keycloak')
            ->patchJson('/api/v1/admin/internship/forms/999999', ['name' => 'X'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/internship/forms/{$form->id}")
            ->assertStatus(405);

        $this->assertDatabaseHas('internship_forms', ['id' => $form->id]);
    }

    public function test_non_admin_roles_are_forbidden(): void
    {
        $form = InternshipForm::create(['name' => 'Czat']);

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $user = User::factory()->role($role)->create();

            $this->actingAs($user, 'keycloak')
                ->getJson('/api/v1/admin/internship/forms')
                ->assertStatus(403);
            $this->actingAs($user, 'keycloak')
                ->postJson('/api/v1/admin/internship/forms', ['name' => 'Nowa'])
                ->assertStatus(403);
            $this->actingAs($user, 'keycloak')
                ->patchJson("/api/v1/admin/internship/forms/{$form->id}", ['is_active' => false])
                ->assertStatus(403);
        }

        $this->assertSame(1, InternshipForm::query()->count());
        $this->assertTrue($form->fresh()->is_active);
    }

    public function test_entry_accepts_an_active_form_and_stores_the_key(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $form = InternshipForm::create(['name' => 'Czat']);

        $this->actingAs($volunteer, 'keycloak')
            ->postJson('/api/v1/internship/entries', $this->entryPayload(['internship_form_id' => $form->id]))
            ->assertCreated();

        $this->assertSame($form->id, InternshipEntry::query()->sole()->internship_form_id);
    }

    public function test_entry_rejects_an_inactive_or_unknown_form(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $inactive = InternshipForm::create(['name' => 'Czat', 'is_active' => false]);

        foreach ([$inactive->id, 999999] as $formId) {
            $this->actingAs($volunteer, 'keycloak')
                ->postJson('/api/v1/internship/entries', $this->entryPayload(['internship_form_id' => $formId]))
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonStructure(['error' => ['errors' => ['internship_form_id']]]);
        }

        $this->assertSame(0, InternshipEntry::query()->count());
    }

    public function test_entry_without_a_form_keeps_working_and_the_response_shape_is_unchanged(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $response = $this->actingAs($volunteer, 'keycloak')
            ->postJson('/api/v1/internship/entries', $this->entryPayload())
            ->assertCreated();

        $this->assertNull(InternshipEntry::query()->sole()->internship_form_id);
        $this->assertSame(
            ['id', 'date', 'hours', 'form', 'consultations_count', 'description', 'status', 'review_comment', 'decided_at', 'created_at', 'updated_at'],
            array_keys($response->json('data')),
        );
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function entryPayload(array $overrides = []): array
    {
        return [
            'date' => now()->subDay()->format('Y-m-d'),
            'hours' => '2.5',
            'form' => 'chat_duty',
            'consultations_count' => 1,
            'description' => 'Dyżur bez danych osób.',
            ...$overrides,
        ];
    }
}
