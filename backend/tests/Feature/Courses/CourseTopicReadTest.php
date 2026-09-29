<?php

namespace Tests\Feature\Courses;

use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\Material;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Odczyt tematów przez uczestnika — addytywnie w istniejących trasach:
 * `GET /courses/{slug}` niesie `topics` i `topic_id` w każdej lekcji,
 * a materiały `lesson_id`; `GET /lessons/{id}` niesie `topic`. Kody
 * odmowy bez zmian (403 `course_locked`, 404 `not_found`).
 */
class CourseTopicReadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_course_detail_carries_topics_and_the_topic_of_every_lesson(): void
    {
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();
        $topic = $course->topics()->firstOrFail();
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $data = $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk()->json('data');

        $this->assertSame(
            [['id' => $topic->id, 'title' => CourseTopic::DEFAULT_TITLE, 'position' => 1]],
            $data['topics'],
        );
        $this->assertSame(array_fill(0, 5, $topic->id), array_column($data['lessons'], 'topic_id'));
        $this->assertSame([1, 2, 3, 4, 5], array_column($data['lessons'], 'sequence_order'));
        $this->assertSame(40, $data['progress_percent']);
    }

    public function test_topics_follow_their_positions_and_lessons_stay_flat(): void
    {
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();
        $first = $course->topics()->firstOrFail();
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        $second = $this->postJson("/api/v1/admin/courses/{$course->id}/topics", ['title' => 'Część druga'])->json('data.id');
        $lessons = $course->lessons()->pluck('id')->all();
        $this->patchJson("/api/v1/admin/courses/{$course->id}/topics/reorder", ['topics' => [
            ['id' => $first->id, 'lesson_ids' => array_slice($lessons, 0, 2)],
            ['id' => $second, 'lesson_ids' => array_slice($lessons, 2)],
        ]])->assertOk();

        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');
        $data = $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk()->json('data');

        $this->assertSame([$first->id, $second], array_column($data['topics'], 'id'));
        $this->assertSame([1, 2], array_column($data['topics'], 'position'));
        $this->assertSame($lessons, array_column($data['lessons'], 'id'));
        $this->assertSame(
            [$first->id, $first->id, $second, $second, $second],
            array_column($data['lessons'], 'topic_id'),
        );
    }

    public function test_materials_tell_a_lesson_material_from_a_course_material(): void
    {
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();
        $lesson = $course->lessons()->firstOrFail();

        Material::create([
            'lesson_id' => $lesson->id,
            'name' => 'Ćwiczenie do lekcji 1.pdf',
            'file_path' => 'materials/wywiad-psychologiczny/cwiczenie.pdf',
            'mime' => 'application/pdf',
            'size' => 1024,
        ]);

        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');
        $materials = $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk()->json('data.materials');

        $this->assertSame(['id', 'name', 'size', 'lesson_id', 'download_url'], array_keys($materials[0]));
        $this->assertSame(
            [
                ['Karta pracy — Wywiad psychologiczny.pdf', null],
                ['Ćwiczenie do lekcji 1.pdf', $lesson->id],
            ],
            array_map(fn (array $material): array => [$material['name'], $material['lesson_id']], $materials),
        );
    }

    public function test_lesson_carries_its_topic(): void
    {
        $lesson = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail()->lessons()->firstOrFail();
        $topic = $lesson->topic;
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.topic', ['id' => $topic->id, 'title' => CourseTopic::DEFAULT_TITLE, 'position' => 1]);
    }

    public function test_lesson_without_a_live_topic_carries_null(): void
    {
        $lesson = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail()->lessons()->firstOrFail();
        Lesson::query()->whereKey($lesson->id)->update(['topic_id' => null, 'topic_position' => null]);
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.topic', null);
    }

    public function test_locked_and_invisible_courses_keep_their_refusals(): void
    {
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->getJson('/api/v1/courses/interwencja-kryzysowa')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');

        $locked = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail()->lessons()->firstOrFail();
        $this->getJson("/api/v1/lessons/{$locked->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');

        $this->getJson('/api/v1/courses/nie-ma-takiego-kursu')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
