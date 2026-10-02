<?php

namespace Tests\Feature\H11;

use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Pakiet H11 · opis wpisu stażu ma najwyżej 2000 znaków — przy dodaniu
 * (`POST /internship/entries`) i przy poprawce (`PATCH /internship/entries/{id}`).
 * Limit liczy znaki, nie bajty: „ż” to jeden znak.
 */
class InternshipDescriptionLengthTest extends TestCase
{
    use RefreshDatabase;

    private const MESSAGE = 'Opis może mieć najwyżej 2000 znaków.';

    protected function setUp(): void
    {
        parent::setUp();

        Edition::create([
            'name' => 'Edycja testowa',
            'internship_hours_required' => 72,
            'status' => 'active',
        ]);
    }

    public function test_store_accepts_description_of_exactly_2000_characters(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $description = str_repeat('ż', 2000);

        $this->actingAs($volunteer, 'keycloak')
            ->postJson('/api/v1/internship/entries', $this->payload($description))
            ->assertCreated()
            ->assertJsonPath('data.description', $description);

        $this->assertSame($description, InternshipEntry::where('user_id', $volunteer->id)->sole()->description);
    }

    public function test_store_rejects_description_of_2001_characters_and_saves_nothing(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($volunteer, 'keycloak')
            ->postJson('/api/v1/internship/entries', $this->payload(str_repeat('ż', 2001)))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.description.0', self::MESSAGE);

        $this->assertSame(0, InternshipEntry::count());
    }

    public function test_update_accepts_description_of_exactly_2000_characters(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $entry = $this->entry($volunteer);
        $description = str_repeat('ż', 2000);

        $this->actingAs($volunteer, 'keycloak')
            ->patchJson("/api/v1/internship/entries/{$entry->id}", ['description' => $description])
            ->assertOk()
            ->assertJsonPath('data.description', $description);

        $this->assertSame($description, $entry->fresh()?->description);
    }

    public function test_update_rejects_description_of_2001_characters_and_changes_nothing(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $entry = $this->entry($volunteer);
        $before = $entry->fresh()?->toArray();

        $this->actingAs($volunteer, 'keycloak')
            ->patchJson("/api/v1/internship/entries/{$entry->id}", [
                'description' => str_repeat('ż', 2001),
                'hours' => '2.0',
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.description.0', self::MESSAGE);

        $this->assertSame($before, $entry->fresh()?->toArray());
        $this->assertSame(1, InternshipEntry::count());
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $description): array
    {
        return [
            'date' => Carbon::today()->toDateString(),
            'hours' => '1.0',
            'form' => 'phone_duty',
            'consultations_count' => 1,
            'description' => $description,
        ];
    }

    private function entry(User $volunteer): InternshipEntry
    {
        return InternshipEntry::create([
            'user_id' => $volunteer->id,
            'date' => '2026-08-20',
            'hours' => '1.0',
            'form' => 'phone_duty',
            'consultations_count' => 0,
            'description' => 'Wpis przed poprawką.',
            'status' => 'submitted',
        ]);
    }
}
