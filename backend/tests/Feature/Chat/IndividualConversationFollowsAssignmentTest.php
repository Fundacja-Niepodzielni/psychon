<?php

namespace Tests\Feature\Chat;

use App\Models\Edition;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Rozmowa indywidualna idzie za przypisaniem superwizora, które nadaje
 * administracja (`PUT /admin/users/{id}/supervisor`). Po zmianie opiekuna:
 * poprzedni opiekun od razu przestaje ją widzieć (to samo 404 co dla wątku
 * nieistniejącego), osoba może ją tylko czytać (zapis → 403 `thread_closed`),
 * a z nowym opiekunem powstaje nowa rozmowa.
 */
class IndividualConversationFollowsAssignmentTest extends TestCase
{
    use RefreshDatabase;
    use SignsInWithRealmToken;

    private User $manager;

    private User $previous;

    private User $next;

    private User $volunteer;

    private MessageThread $conversation;

    private MessageThread $previousGroup;

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);

        $this->manager = $this->account('project_manager');
        $this->previous = $this->account('instructor');
        $this->next = $this->account('instructor');
        $this->volunteer = $this->account('volunteer');

        $this->assign($this->previous);

        // Osoba otwiera listę — powstaje rozmowa indywidualna i wątek grupowy opiekuna.
        $this->signedInAs($this->volunteer)->getJson('/api/v1/threads')->assertOk();
        $this->conversation = MessageThread::query()->where('type', 'individual')
            ->where('volunteer_id', $this->volunteer->id)->where('supervisor_id', $this->previous->id)->sole();
        $this->previousGroup = MessageThread::query()->where('type', 'group')
            ->where('supervisor_id', $this->previous->id)->sole();

        $this->signedInAs($this->volunteer)
            ->postJson("/api/v1/threads/{$this->conversation->id}/messages", ['body' => 'Pytanie przed zmianą.'])
            ->assertCreated();
        $this->signedInAs($this->previous)
            ->postJson("/api/v1/threads/{$this->conversation->id}/messages", ['body' => 'Odpowiedź przed zmianą.'])
            ->assertCreated();
    }

    private function assign(User $supervisor): void
    {
        $this->signedInAs($this->manager)
            ->putJson("/api/v1/admin/users/{$this->volunteer->id}/supervisor", ['supervisor_id' => $supervisor->id])
            ->assertOk()
            ->assertJsonPath('data.supervisor_id', $supervisor->id);
    }

    private function missingThreadId(): int
    {
        return (int) MessageThread::query()->max('id') + 1000;
    }

    /**
     * @return array<string, array<string, mixed>|null>
     */
    private static function bodies(): array
    {
        return [
            'poprawna treść' => ['body' => 'Piszę po zmianie przypisania.'],
            'bez ciała' => [],
            'pusta treść' => ['body' => ''],
            'za długa treść' => ['body' => str_repeat('a', 6000)],
            'zły JSON' => null,
        ];
    }

    private function postAs(User $user, int $thread, ?array $body): string
    {
        $this->signedInAs($user);
        $uri = "/api/v1/threads/{$thread}/messages";
        $response = $body === null ? $this->postMalformedJson($uri) : $this->postJson($uri, $body);

        return $response->getStatusCode().' '.$response->getContent();
    }

    public function test_previous_supervisor_loses_reading_and_writing_at_once(): void
    {
        $this->assign($this->next);

        $missing = $this->missingThreadId();
        $read = $this->signedInAs($this->previous)->getJson("/api/v1/threads/{$this->conversation->id}");
        $readMissing = $this->signedInAs($this->previous)->getJson("/api/v1/threads/{$missing}");
        $read->assertNotFound()->assertJsonPath('error.code', 'not_found')
            ->assertJsonPath('error.message', 'Nie znaleziono wątku.');
        $this->assertSame($readMissing->getContent(), $read->getContent());

        foreach (self::bodies() as $label => $body) {
            $this->assertSame(
                $this->postAs($this->previous, $missing, $body),
                $this->postAs($this->previous, $this->conversation->id, $body),
                $label,
            );
            $this->assertStringStartsWith('404 ', $this->postAs($this->previous, $this->conversation->id, $body), $label);
        }

        $this->assertSame(2, Message::query()->where('thread_id', $this->conversation->id)->count());

        $list = $this->signedInAs($this->previous)->getJson('/api/v1/threads')->assertOk();
        $this->assertNotContains($this->conversation->id, collect($list->json('data'))->pluck('id')->all());
    }

    public function test_volunteer_keeps_the_previous_conversation_for_reading_only(): void
    {
        $this->assign($this->next);

        $list = collect($this->signedInAs($this->volunteer)->getJson('/api/v1/threads')->assertOk()->json('data'));
        $this->assertContains($this->conversation->id, $list->pluck('id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(
            $this->previous->id,
            $list->firstWhere('id', $this->conversation->id)['supervisor']['id'],
        );

        $this->signedInAs($this->volunteer)->getJson("/api/v1/threads/{$this->conversation->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.extra.type', 'individual')
            ->assertJsonPath('data.0.body', 'Pytanie przed zmianą.')
            ->assertJsonPath('data.1.body', 'Odpowiedź przed zmianą.');

        // Dostęp przed walidacją treści: każde ciało dostaje tę samą odmowę.
        $responses = [];
        foreach (self::bodies() as $label => $body) {
            $responses[$label] = $this->postAs($this->volunteer, $this->conversation->id, $body);
            $this->assertStringStartsWith('403 ', $responses[$label], $label);
            $this->assertStringContainsString('"code":"thread_closed"', $responses[$label], $label);
        }
        $this->assertCount(1, array_unique($responses));

        $this->assertSame(2, Message::query()->where('thread_id', $this->conversation->id)->count());

        // Wątek grupowy poprzedniego opiekuna — bez zmian: 404.
        $this->signedInAs($this->volunteer)->getJson("/api/v1/threads/{$this->previousGroup->id}")
            ->assertNotFound()->assertJsonPath('error.message', 'Nie znaleziono wątku.');
    }

    public function test_new_supervisor_starts_a_new_conversation(): void
    {
        $this->assign($this->next);

        // Lista osoby: nowa rozmowa z nowym opiekunem i, obok, stara rozmowa
        // z poprzednim opiekunem (do odczytu) — razem dwie rozmowy indywidualne.
        $list = collect($this->signedInAs($this->volunteer)->getJson('/api/v1/threads')->assertOk()->json('data'));
        $individual = $list->where('type', 'individual')->values();
        $this->assertCount(2, $individual);
        $current = $individual->firstWhere('supervisor.id', $this->next->id);
        $this->assertNotNull($current);
        $newId = (int) $current['id'];
        $this->assertNotSame($this->conversation->id, $newId);
        $this->assertContains($this->conversation->id, $individual->pluck('id')->map(fn ($id) => (int) $id)->all());

        $this->signedInAs($this->next)->getJson("/api/v1/threads/{$newId}")
            ->assertOk()->assertJsonPath('meta.total', 0);
        $this->signedInAs($this->next)
            ->postJson("/api/v1/threads/{$newId}/messages", ['body' => 'Dzień dobry, jestem nowym opiekunem.'])
            ->assertCreated();
        $this->signedInAs($this->volunteer)
            ->postJson("/api/v1/threads/{$newId}/messages", ['body' => 'Dzień dobry.'])
            ->assertCreated();

        // Nowy opiekun nie czyta poprzedniej rozmowy — to samo 404 co wątek nieistniejący.
        $foreign = $this->signedInAs($this->next)->getJson("/api/v1/threads/{$this->conversation->id}")->assertNotFound();
        $missing = $this->signedInAs($this->next)->getJson('/api/v1/threads/'.$this->missingThreadId())->assertNotFound();
        $this->assertSame($missing->getContent(), $foreign->getContent());
    }

    public function test_volunteer_without_an_active_assignment_still_lists_the_conversation_for_reading(): void
    {
        SupervisorAssignment::query()
            ->where('volunteer_id', $this->volunteer->id)
            ->whereNull('unassigned_at')
            ->update(['unassigned_at' => now()]);
        $this->assertSame(0, SupervisorAssignment::query()
            ->where('volunteer_id', $this->volunteer->id)->whereNull('unassigned_at')->count());

        $list = collect($this->signedInAs($this->volunteer)->getJson('/api/v1/threads')->assertOk()->json('data'));
        $this->assertSame([$this->conversation->id], $list->pluck('id')->map(fn ($id) => (int) $id)->all());

        $this->signedInAs($this->volunteer)->getJson("/api/v1/threads/{$this->conversation->id}")
            ->assertOk()->assertJsonPath('meta.total', 2);
        $this->signedInAs($this->volunteer)
            ->postJson("/api/v1/threads/{$this->conversation->id}/messages", ['body' => 'Piszę bez opiekuna.'])
            ->assertForbidden()->assertJsonPath('error.code', 'thread_closed');
        $this->assertSame(2, Message::query()->where('thread_id', $this->conversation->id)->count());
    }

    public function test_assigning_back_reopens_the_same_conversation(): void
    {
        $this->assign($this->next);
        $this->assign($this->previous);

        $this->signedInAs($this->previous)->getJson("/api/v1/threads/{$this->conversation->id}")
            ->assertOk()->assertJsonPath('meta.total', 2);
        $this->signedInAs($this->volunteer)
            ->postJson("/api/v1/threads/{$this->conversation->id}/messages", ['body' => 'Znowu razem.'])
            ->assertCreated();
        $this->signedInAs($this->previous)
            ->postJson("/api/v1/threads/{$this->conversation->id}/messages", ['body' => 'Witam ponownie.'])
            ->assertCreated();

        $this->assertSame(1, SupervisorAssignment::query()
            ->where('volunteer_id', $this->volunteer->id)->whereNull('unassigned_at')->count());
    }

    public function test_an_outsider_gets_the_missing_thread_answer_for_every_body(): void
    {
        $outsider = $this->account('instructor');
        $otherVolunteer = $this->account('volunteer');
        $missing = $this->missingThreadId();

        foreach ([$outsider, $otherVolunteer] as $caller) {
            foreach (self::bodies() as $label => $body) {
                $foreign = $this->postAs($caller, $this->conversation->id, $body);
                $this->assertStringStartsWith('404 ', $foreign, $label);
                $this->assertSame($this->postAs($caller, $missing, $body), $foreign, $label);
            }
        }

        $this->assertSame(2, Message::query()->where('thread_id', $this->conversation->id)->count());
    }

    public function test_current_pair_still_validates_the_body(): void
    {
        $this->signedInAs($this->volunteer)
            ->postJson("/api/v1/threads/{$this->conversation->id}/messages", ['body' => ''])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.body.0', 'Wpisz treść wiadomości.');

        $this->signedInAs($this->previous)->getJson("/api/v1/threads/{$this->conversation->id}")
            ->assertOk()->assertJsonPath('meta.total', 2);
    }
}
