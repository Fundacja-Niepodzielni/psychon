<?php

namespace Tests\Feature\Courses;

use App\Models\Course;
use App\Models\Material;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/v1/courses/{slug} — contract §2 „Kursy (H05)" for the unlocked
 * shape, §1.1 for the refusals (403 course_locked vs. 404 not_found).
 */
class CourseDetailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_unlocked_course_returns_the_contract_shape(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $response = $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk();
        $data = $response->json('data');

        $this->assertSame(
            ['id', 'slug', 'title', 'sequence_order', 'product_group', 'status', 'progress_percent',
                'instructor', 'lessons', 'materials'],
            array_keys($data),
        );

        $this->assertSame('in_progress', $data['status']);
        $this->assertSame(40, $data['progress_percent']);
        $this->assertSame('Joanna Demo', $data['instructor']['name']);
        $this->assertSame(
            $this->user('joanna@demo.pl')->id,
            $data['instructor']['id'],
        );

        // 5 lessons, the first two completed by marta (seed §3: 2/5 → 40%).
        $this->assertSame([1, 2, 3, 4, 5], array_column($data['lessons'], 'sequence_order'));
        $this->assertSame([true, true, false, false, false], array_column($data['lessons'], 'is_completed'));
        $this->assertSame(
            ['id', 'title', 'sequence_order', 'duration_seconds', 'is_completed'],
            array_keys($data['lessons'][0]),
        );

        // Contract §2 lists a material as {id, name, download_url}. `size` is a
        // deliberate widening shipped ahead of the guardian's ruling — deviation
        // (7) in DEMO/H05.md. Pinned here so the extra field stays intentional:
        // if the guardian refuses it, this assertion is what fails first.
        $this->assertSame(['id', 'name', 'size', 'download_url'], array_keys($data['materials'][0]));
        $this->assertSame('Karta pracy — Wywiad psychologiczny.pdf', $data['materials'][0]['name']);
        $this->assertIsInt($data['materials'][0]['size']);

        // Contract §2: „<podpisany, wygasa>" — the link must carry both.
        $link = $data['materials'][0]['download_url'];
        $this->assertStringContainsString(
            "/api/v1/materials/{$data['materials'][0]['id']}/download",
            $link,
        );
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);
        $this->assertArrayHasKey('signature', $query);
        $this->assertArrayHasKey('expires', $query);
        $this->assertSame((string) $this->user('marta@demo.pl')->id, $query['u']);
    }

    public function test_materials_include_uploads_attached_to_a_lesson(): void
    {
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();

        Material::create([
            'lesson_id' => $course->lessons()->first()->id,
            'name' => 'Ćwiczenie do lekcji 1.pdf',
            'file_path' => 'materials/wywiad-psychologiczny/cwiczenie.pdf',
            'mime' => 'application/pdf',
            'size' => 1024,
        ]);

        Sanctum::actingAs($this->user('marta@demo.pl'));

        $names = collect($this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk()->json('data.materials'))
            ->pluck('name')
            ->all();

        $this->assertSame(
            ['Karta pracy — Wywiad psychologiczny.pdf', 'Ćwiczenie do lekcji 1.pdf'],
            $names,
        );
    }

    public function test_locked_course_is_refused_with_the_contract_reason(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $course2 = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();

        $response = $this->getJson('/api/v1/courses/interwencja-kryzysowa')->assertStatus(403);

        $response->assertJsonPath('error.status', 403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.message', 'Ukończ najpierw etap 2: Wywiad psychologiczny.')
            ->assertJsonPath('error.reason.required_course_id', $course2->id);

        $this->assertEqualsCanonicalizing(['lessons', 'test'], $response->json('error.reason.missing'));
    }

    public function test_unknown_slug_returns_404(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson('/api/v1/courses/nie-ma-takiego-kursu')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_non_participant_is_not_blocked_by_the_sequence(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));

        $data = $this->getJson('/api/v1/courses/interwencja-kryzysowa')->assertOk()->json('data');

        $this->assertSame('in_progress', $data['status']);
        $this->assertSame([false, false, false, false, false], array_column($data['lessons'], 'is_completed'));
    }

    public function test_course_without_an_active_assignment_has_no_instructor(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));

        $this->getJson('/api/v1/courses/praca-z-emocjami')
            ->assertOk()
            ->assertJsonPath('data.instructor', null);
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
