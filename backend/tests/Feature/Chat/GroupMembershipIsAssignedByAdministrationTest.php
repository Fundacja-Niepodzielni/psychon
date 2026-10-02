<?php

namespace Tests\Feature\Chat;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\MessageThread;
use App\Models\Notification;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Skład grupy prowadzącego wyznacza wyłącznie administracja
 * (`PUT /admin/users/{id}/supervisor`). Adres
 * `POST /threads/{thread}/members/{user}` odpowiada każdemu zalogowanemu
 * tym samym 404 co nieznana trasa — dla każdego identyfikatora i każdego
 * ciała — i niczego nie zapisuje.
 */
class GroupMembershipIsAssignedByAdministrationTest extends TestCase
{
    use RefreshDatabase;
    use SignsInWithRealmToken;

    private Edition $active;

    private Edition $closed;

    protected function setUp(): void
    {
        parent::setUp();

        $this->closed = Edition::factory()->create(['status' => 'closed', 'name' => 'Edycja dawna']);
        $this->active = Edition::factory()->create(['status' => 'active', 'name' => 'Edycja bieżąca']);
    }

    private function ownGroupThread(User $instructor): int
    {
        $response = $this->signedInAs($instructor)->postJson('/api/v1/threads');
        $response->assertCreated()->assertJsonPath('data.type', 'group');

        return (int) $response->json('data.id');
    }

    /**
     * Odpowiedź na adres, którego aplikacja nie zna — wzorzec, z którym
     * porównujemy odpowiedzi trasy dodawania.
     */
    private function unknownRouteResponse(User $caller): TestResponse
    {
        return $this->signedInAs($caller)
            ->postJson('/api/v1/threads/1/nieznany-adres/1')
            ->assertNotFound();
    }

    public function test_instructor_does_not_gain_any_volunteer_through_the_group_thread(): void
    {
        $instructor = $this->account('instructor', ['product_group' => 'psychon', 'edition_id' => $this->active->id]);
        $otherGroup = $this->account('volunteer', [
            'first_name' => 'Anna', 'last_name' => 'Fikcyjna',
            'product_group' => 'dobrostan', 'edition_id' => $this->active->id,
        ]);
        $otherEdition = $this->account('volunteer', [
            'first_name' => 'Bartosz', 'last_name' => 'Zmyślony',
            'product_group' => 'dobrostan', 'edition_id' => $this->closed->id,
        ]);

        $thread = $this->ownGroupThread($instructor);
        $reference = $this->unknownRouteResponse($instructor)->getContent();

        foreach ([$otherGroup, $otherEdition] as $volunteer) {
            $response = $this->signedInAs($instructor)
                ->postJson("/api/v1/threads/{$thread}/members/{$volunteer->id}")
                ->assertNotFound()
                ->assertJsonPath('error.code', 'not_found');
            $this->assertSame($reference, $response->getContent());
        }

        $this->assertSame(0, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());
        $this->assertSame(0, Notification::query()->where('type', 'thread.member_added')->count());

        $this->signedInAs($instructor)->getJson('/api/v1/instructor/group')
            ->assertOk()->assertJsonPath('data.members', []);
        $this->signedInAs($instructor)->getJson('/api/v1/instructor/reliability')
            ->assertOk()->assertJsonPath('meta.total', 0);

        $threads = $this->signedInAs($instructor)->getJson('/api/v1/threads')->assertOk();
        $this->assertSame(['group'], collect($threads->json('data'))->pluck('type')->unique()->values()->all());
        $this->assertSame(0, MessageThread::query()->where('type', 'individual')->count());
    }

    public function test_the_refusal_is_the_same_for_every_identifier_and_every_body(): void
    {
        $instructor = $this->account('instructor');
        $otherInstructor = $this->account('instructor');
        $student = $this->account('student');
        $manager = $this->account('project_manager');
        $taken = $this->account('volunteer');
        $free = $this->account('volunteer');

        SupervisorAssignment::query()->create([
            'volunteer_id' => $taken->id, 'supervisor_id' => $otherInstructor->id, 'assigned_at' => now(),
        ]);

        $ownThread = $this->ownGroupThread($instructor);
        $foreignThread = $this->ownGroupThread($otherInstructor);
        $individual = MessageThread::query()->create([
            'type' => 'individual', 'volunteer_id' => $free->id, 'supervisor_id' => $instructor->id,
        ])->id;
        $missingThread = (int) MessageThread::query()->max('id') + 1000;
        $missingUser = (int) User::query()->max('id') + 1000;

        $reference = $this->unknownRouteResponse($instructor)->getContent();
        $bodies = [
            'bez ciała' => [],
            'puste pole' => ['volunteer_id' => ''],
            'pole spoza słownika' => ['x' => str_repeat('a', 6000)],
            'zły typ' => ['volunteer_id' => ['nie', 'liczba']],
        ];

        $checked = 0;
        foreach ([$ownThread, $foreignThread, $individual, $missingThread] as $thread) {
            foreach ([$missingUser, $student->id, $manager->id, $taken->id, $free->id] as $user) {
                $uri = "/api/v1/threads/{$thread}/members/{$user}";

                foreach ($bodies as $label => $body) {
                    $response = $this->signedInAs($instructor)->postJson($uri, $body);
                    $this->assertSame(404, $response->getStatusCode(), "{$uri} ({$label})");
                    $this->assertSame($reference, $response->getContent(), "{$uri} ({$label})");
                    $checked++;
                }

                $malformed = $this->signedInAs($instructor)->postMalformedJson($uri);
                $this->assertSame(404, $malformed->getStatusCode(), "{$uri} (zły JSON)");
                $this->assertSame($reference, $malformed->getContent(), "{$uri} (zły JSON)");
                $checked++;
            }
        }
        $this->assertSame(100, $checked);

        // Nic się nie zmieniło: zajęta osoba nadal u swojego prowadzącego, wolna bez opiekuna.
        $this->assertSame([$otherInstructor->id], SupervisorAssignment::query()
            ->where('volunteer_id', $taken->id)->whereNull('unassigned_at')->pluck('supervisor_id')->all());
        $this->assertSame(1, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());
        $this->assertSame(0, Notification::query()->where('type', 'thread.member_added')->count());
    }

    public function test_every_signed_in_role_gets_the_same_refusal(): void
    {
        $instructor = $this->account('instructor');
        $free = $this->account('volunteer');
        $thread = $this->ownGroupThread($instructor);

        foreach (['volunteer', 'student', 'project_manager', 'super_admin'] as $role) {
            $caller = $role === 'volunteer' ? $free : $this->account($role);
            $reference = $this->unknownRouteResponse($caller)->getContent();

            $response = $this->signedInAs($caller)
                ->postJson("/api/v1/threads/{$thread}/members/{$free->id}", ['volunteer_id' => $free->id]);

            $this->assertSame(404, $response->getStatusCode(), $role);
            $this->assertSame($reference, $response->getContent(), $role);
        }

        $this->assertSame(0, SupervisorAssignment::query()->count());
    }

    public function test_administration_assigns_and_the_instructor_sees_the_person_in_the_group(): void
    {
        $manager = $this->account('project_manager');
        $instructor = $this->account('instructor', ['edition_id' => $this->active->id]);
        $volunteer = $this->account('volunteer', [
            'first_name' => 'Celina', 'last_name' => 'Przykładowa', 'edition_id' => $this->active->id,
        ]);

        $this->signedInAs($manager)
            ->putJson("/api/v1/admin/users/{$volunteer->id}/supervisor", ['supervisor_id' => $instructor->id])
            ->assertOk()
            ->assertJsonPath('data.volunteer_id', $volunteer->id)
            ->assertJsonPath('data.supervisor_id', $instructor->id);

        $this->assertSame(1, AuditLogEntry::query()
            ->where('action', 'supervisor.assigned')->where('actor_id', $manager->id)->count());

        $this->signedInAs($instructor)->getJson('/api/v1/instructor/group')
            ->assertOk()
            ->assertJsonCount(1, 'data.members')
            ->assertJsonPath('data.members.0.id', $volunteer->id)
            ->assertJsonPath('data.members.0.last_name', 'Przykładowa');

        $threads = collect($this->signedInAs($instructor)->getJson('/api/v1/threads')->assertOk()->json('data'));
        $this->assertSame([$volunteer->id], $threads->where('type', 'individual')->pluck('volunteer.id')->values()->all());
    }
}
