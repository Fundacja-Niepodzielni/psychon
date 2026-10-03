<?php

namespace Tests\Feature\Chat;

use App\Models\Edition;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Rozmowy uczestników z prowadzącymi są prywatne: administracja
 * (`project_manager`, `super_admin`) nie czyta wątków, nie pisze w nich
 * i nie widzi ich na liście `GET /threads`. Dla wątku istniejącego i
 * nieistniejącego odpowiedź jest identyczna: odczyt daje 404 `not_found`, zapis
 * wiadomości 403 `forbidden` (rola administracji nie ma dostępu do zapisu w czacie,
 * rozstrzygnięte przed odczytem wątku).
 */
class AdministrationHasNoThreadAccessTest extends TestCase
{
    use RefreshDatabase;
    use SignsInWithRealmToken;

    private User $volunteer;

    private User $instructor;

    private MessageThread $individual;

    private MessageThread $group;

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);

        $this->volunteer = $this->account('volunteer');
        $this->instructor = $this->account('instructor');
        SupervisorAssignment::query()->create([
            'volunteer_id' => $this->volunteer->id,
            'supervisor_id' => $this->instructor->id,
            'assigned_at' => now(),
        ]);

        $this->signedInAs($this->volunteer)->getJson('/api/v1/threads')->assertOk();
        $this->individual = MessageThread::query()->where('type', 'individual')->sole();
        $this->group = MessageThread::query()->where('type', 'group')->sole();

        $this->signedInAs($this->volunteer)
            ->postJson("/api/v1/threads/{$this->individual->id}/messages", ['body' => 'Wiadomość osoby.'])
            ->assertCreated();
        $this->signedInAs($this->instructor)
            ->postJson("/api/v1/threads/{$this->group->id}/messages", ['body' => 'Wiadomość do grupy.'])
            ->assertCreated();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function administrationRoles(): array
    {
        return [
            'opiekun projektu' => ['project_manager'],
            'super admin' => ['super_admin'],
        ];
    }

    private function missingThreadId(): int
    {
        return (int) MessageThread::query()->max('id') + 1000;
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_does_not_read_threads(string $role): void
    {
        $admin = $this->account($role);
        $missing = $this->signedInAs($admin)->getJson('/api/v1/threads/'.$this->missingThreadId())
            ->assertNotFound()->assertJsonPath('error.code', 'not_found');

        foreach ([$this->individual, $this->group] as $thread) {
            $response = $this->signedInAs($admin)->getJson("/api/v1/threads/{$thread->id}")->assertNotFound();
            $this->assertSame($missing->getContent(), $response->getContent());
        }
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_does_not_write_to_threads(string $role): void
    {
        $admin = $this->account($role);
        $before = Message::query()->count();
        $missing = $this->missingThreadId();

        foreach (['poprawna treść' => ['body' => 'Piszę jako administracja.'], 'bez ciała' => [], 'pusta treść' => ['body' => '']] as $label => $body) {
            $expected = $this->signedInAs($admin)->postJson("/api/v1/threads/{$missing}/messages", $body);
            foreach ([$this->individual, $this->group] as $thread) {
                $response = $this->signedInAs($admin)->postJson("/api/v1/threads/{$thread->id}/messages", $body);
                $this->assertSame(403, $response->getStatusCode(), $label);
                $this->assertSame('forbidden', $response->json('error.code'), $label);
                $this->assertSame($expected->getContent(), $response->getContent(), $label);
            }
        }

        $this->assertSame($before, Message::query()->count());
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_does_not_see_threads_on_the_list(string $role): void
    {
        $admin = $this->account($role);
        $threadsBefore = MessageThread::query()->count();

        $this->signedInAs($admin)->getJson('/api/v1/threads')
            ->assertOk()
            ->assertJsonPath('data', []);

        $this->assertSame($threadsBefore, MessageThread::query()->count());
    }
}
