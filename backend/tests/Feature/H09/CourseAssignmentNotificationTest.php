<?php

namespace Tests\Feature\H09;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\EmailMessage;
use App\Models\Lesson;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Wpis w dzwonku prowadzącego po przypisaniu i odebraniu kursu: treść bez
 * rodzaju gramatycznego i odnośnik pod adres, który istnieje w panelu
 * prowadzącego w starym i w nowym wyglądzie (`/prowadzacy/kursy/[id]`,
 * `/prowadzacy/kursy`, `/prowadzacy/pytania`). Kurs założony przez samego
 * prowadzącego nie daje mu żadnej wiadomości.
 */
class CourseAssignmentNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_assignment_to_a_whole_course_links_to_that_course_screen(): void
    {
        $course = $this->course('Praca z emocjami');
        $instructor = User::factory()->role('instructor')->create();
        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $instructor->id,
        ])->assertCreated();

        $notification = Notification::query()->where('user_id', $instructor->id)->sole();

        $this->assertSame('assignment.created', $notification->type);
        $this->assertSame('Przypisano Cię jako prowadzącego', $notification->title);
        $this->assertSame('Masz nowy kurs do uzupełnienia: „Praca z emocjami”.', $notification->body);
        $this->assertSame("/prowadzacy/kursy/{$course->id}", $notification->link);
        $this->assertSame(1, EmailMessage::query()->where('to_user_id', $instructor->id)->count());
    }

    public function test_removal_from_a_whole_course_links_to_the_course_list(): void
    {
        $course = $this->course('Praca z emocjami');
        $instructor = User::factory()->role('instructor')->create();
        $this->actingAsAdmin();

        $assignmentId = $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $instructor->id,
        ])->assertCreated()->json('data.id');

        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'assignment_id' => $assignmentId,
        ])->assertOk();

        $notification = Notification::query()
            ->where('user_id', $instructor->id)
            ->where('type', 'assignment.removed')
            ->sole();

        $this->assertSame('Kurs „Praca z emocjami” nie jest już przypisany do Ciebie.', $notification->body);
        $this->assertSame('/prowadzacy/kursy', $notification->link);
    }

    public function test_assignment_to_a_single_lesson_speaks_of_the_lesson_and_links_to_questions(): void
    {
        $course = $this->course('Praca z emocjami');
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja 1',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
        $instructor = User::factory()->role('instructor')->create();
        $this->actingAsAdmin();

        $assignmentId = $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $instructor->id,
            'lesson_id' => $lesson->id,
        ])->assertCreated()->json('data.id');

        $created = Notification::query()->where('user_id', $instructor->id)->sole();
        $this->assertSame('Masz nową lekcję do prowadzenia w kursie „Praca z emocjami”.', $created->body);
        $this->assertSame('/prowadzacy/pytania', $created->link);

        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'assignment_id' => $assignmentId,
        ])->assertOk();

        $removed = Notification::query()
            ->where('user_id', $instructor->id)
            ->where('type', 'assignment.removed')
            ->sole();
        $this->assertSame('Lekcja w kursie „Praca z emocjami” nie jest już przypisana do Ciebie.', $removed->body);
        $this->assertSame('/prowadzacy/kursy', $removed->link);
    }

    public function test_no_bell_entry_names_the_reader_in_a_gendered_form(): void
    {
        $course = $this->course('Praca z emocjami');
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja 1',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
        $instructor = User::factory()->role('instructor')->create();
        $this->actingAsAdmin();

        foreach ([[], ['lesson_id' => $lesson->id]] as $scope) {
            $id = $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", $scope + [
                'instructor_id' => $instructor->id,
            ])->assertCreated()->json('data.id');

            $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
                'assignment_id' => $id,
            ])->assertOk();
        }

        $bodies = Notification::query()->where('user_id', $instructor->id)->pluck('body')->all();
        $this->assertCount(4, $bodies);

        foreach ($bodies as $body) {
            $this->assertDoesNotMatchRegularExpression('/zostałe[śm]|zostałaś|przypisany jako|przypisana jako/iu', $body);
        }
    }

    public function test_an_instructor_creating_an_own_course_gets_no_notification_and_no_email(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $courseId = $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', [
                'title' => 'Kurs własny prowadzącego',
                'slug' => 'kurs-wlasny-prowadzacego',
                'description' => 'Opis kursu.',
                'type' => 'course',
            ])
            ->assertCreated()
            ->json('data.id');

        $this->assertTrue(
            CourseAssignment::query()
                ->where('course_id', $courseId)
                ->where('instructor_id', $instructor->id)
                ->whereNull('lesson_id')
                ->whereNull('unassigned_at')
                ->exists(),
        );
        $this->assertDatabaseHas('audit_log', ['action' => 'assignment.created']);
        $this->assertSame(0, Notification::query()->where('user_id', $instructor->id)->count());
        $this->assertSame(0, EmailMessage::query()->where('to_user_id', $instructor->id)->count());
    }

    private function course(string $title): Course
    {
        return Course::create([
            'title' => $title,
            'slug' => 'kurs-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'is_published' => false,
        ]);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        return $admin;
    }
}
