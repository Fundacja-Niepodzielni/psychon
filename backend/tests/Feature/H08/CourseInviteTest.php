<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H08 · zaproszenia na kurs poza główną ścieżką.
 *
 * Oczekiwane wartości pochodzą z planu fazy 8, z karty pakietu (kryterium 5),
 * z kontraktu API (§1.1 tabela kodów, §3.1 rejestr powiadomień, §3.2 rejestr
 * audytu) i ze specyfikacji M4 pkt 6 („dotyczy kursów poza główną ścieżką") —
 * nigdy z tego, co akurat zwraca kod.
 */
class CourseInviteTest extends TestCase
{
    use RefreshDatabase;

    public function test_volunteer_is_forbidden_on_the_invite_route(): void
    {
        $webinar = $this->webinar();
        $invitee = $this->participant();

        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->postJson("/api/v1/admin/courses/{$webinar->id}/invite", [
            'user_ids' => [$invitee->id],
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame(0, Notification::query()->count());
        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_guest_is_unauthenticated(): void
    {
        $webinar = $this->webinar();
        $invitee = $this->participant();

        $this->postJson("/api/v1/admin/courses/{$webinar->id}/invite", [
            'user_ids' => [$invitee->id],
        ])->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_unknown_course_returns_not_found(): void
    {
        $invitee = $this->participant();

        $this->actingAsAdmin();

        $this->postJson('/api/v1/admin/courses/999999/invite', [
            'user_ids' => [$invitee->id],
        ])->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * Kryterium 5 karty pakietu, handshake z szyną H16: jedno wywołanie
     * `Notify::send` musi zostawić ślad w OBU miejscach — dzwonek w
     * `notifications` i symulowany e-mail w skrzynce `emails`.
     */
    public function test_invitation_creates_a_bell_notification_and_a_simulated_email(): void
    {
        $webinar = $this->webinar();
        $first = $this->participant('filip@demo.pl');
        $second = $this->participant('marta@demo.pl');

        $admin = $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$webinar->id}/invite", [
            'user_ids' => [$first->id, $second->id],
        ])->assertOk()
            ->assertExactJson(['data' => ['invited' => 2]]);

        // Typ dokładnie z rejestru §3.1 — H08 nie emituje żadnego innego.
        $notifications = Notification::query()->where('type', 'course.invited')->get();

        $this->assertSame(2, $notifications->count());
        $this->assertSame(
            [$first->id, $second->id],
            $notifications->pluck('user_id')->sort()->values()->all(),
        );

        foreach ($notifications as $notification) {
            $this->assertSame("/panel/kursy/{$webinar->slug}", $notification->link);
            $this->assertNull($notification->read_at);
        }

        // Skrzynka nadawcza: nic nie wychodzi w świat (kontrakt §3.4).
        $emails = EmailMessage::query()->get();

        $this->assertSame(2, $emails->count());
        $this->assertSame(
            ['filip@demo.pl', 'marta@demo.pl'],
            $emails->pluck('to_email')->sort()->values()->all(),
        );
        $this->assertSame(['simulated'], $emails->pluck('status')->unique()->values()->all());

        // Rejestr audytu §3.2 nie ma slugu dla zaproszenia — operacja zapisuje
        // się jako `course.updated` na kursie, z rodzajem w `details.op`.
        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();

        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($webinar->id, $entry->subject_id);
        $this->assertSame('course.invited', $entry->details['op']);
        $this->assertSame([$first->id, $second->id], $entry->details['user_ids']);
    }

    /**
     * M4 pkt 6 ogranicza zapraszanie do kursów poza główną ścieżką. Kurs ze
     * ścieżki odblokowuje się sekwencyjnie, więc zaproszenie obiecywałoby
     * dostęp, którego nie nadaje.
     */
    public function test_inviting_to_a_course_from_the_main_path_is_rejected(): void
    {
        $stage = $this->course('etap-2', ['sequence_order' => 2, 'is_published' => true]);
        $invitee = $this->participant();

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$stage->id}/invite", [
            'user_ids' => [$invitee->id],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met');

        $this->assertSame(0, Notification::query()->count());
        $this->assertSame(0, EmailMessage::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->count());
    }

    public function test_unknown_person_is_rejected_as_a_field_error(): void
    {
        $webinar = $this->webinar();

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$webinar->id}/invite", [
            'user_ids' => [999999],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['user_ids.0']]]);

        $this->assertSame(0, Notification::query()->count());
        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_empty_recipient_list_is_rejected_as_a_field_error(): void
    {
        $webinar = $this->webinar();

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$webinar->id}/invite", ['user_ids' => []])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['user_ids']]]);
    }

    public function test_repeated_person_on_the_list_is_rejected_as_a_field_error(): void
    {
        $webinar = $this->webinar();
        $invitee = $this->participant();

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$webinar->id}/invite", [
            'user_ids' => [$invitee->id, $invitee->id],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(0, Notification::query()->count());
    }

    /** Kurs poza główną ścieżką — jedyny, na który wolno zapraszać. */
    private function webinar(): Course
    {
        return $this->course('webinar-wrzesien', [
            'title' => 'Webinar wrześniowy',
            'type' => 'webinar',
            'sequence_order' => null,
            'is_published' => true,
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function course(string $slug, array $attributes = []): Course
    {
        return Course::create($attributes + [
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function participant(?string $email = null): User
    {
        $factory = User::factory()->role('volunteer');

        return $email === null
            ? $factory->create()
            : $factory->create(['email' => $email]);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        return $admin;
    }
}
