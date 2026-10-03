<?php

namespace Tests\Feature\Chat;

use App\Models\Message;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Świadek zakresu refaktoru `ThreadController::show()` (w. 121-125): kształt
 * elementu `data` w odpowiedzi `GET /threads/{id}` ma zostać identyczny po
 * zamianie ręcznego `map()` na kolekcję zasobu. Oczekiwane ciało budowane
 * jest niezależnie od kontrolera — wprost z atrybutów zasianych wiadomości,
 * odczytanych ponownie z bazy — więc test nie zzieleni się przypadkiem razem
 * ze zmianą samego zasobu (`MessageResource`).
 */
class ThreadShowResourceShapeWitnessTest extends TestCase
{
    use RefreshDatabase;

    public function test_message_list_body_matches_the_shape_built_independently_of_the_controller(): void
    {
        $volunteer = User::factory()->role('volunteer')->create();
        $supervisor = User::factory()->role('instructor')->create();

        // Aktywne przypisanie pary — rozmowa jest otwarta (`read_only` = false).
        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $supervisor->id,
            'assigned_at' => now(),
        ]);

        $thread = MessageThread::query()->create([
            'type' => 'individual',
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $supervisor->id,
        ]);

        $withSender = Message::query()->create([
            'thread_id' => $thread->id,
            'sender_id' => $supervisor->id,
            'body' => 'Wiadomość z nadawcą.',
        ])->refresh();

        $withoutSender = Message::query()->create([
            'thread_id' => $thread->id,
            'sender_id' => null,
            'body' => 'Wiadomość systemowa bez nadawcy.',
        ])->refresh();

        $response = $this->actingAs($volunteer, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}")
            ->assertOk();

        // Wzorzec budowany wprost z atrybutów modeli zasianych wyżej (kolejność
        // rosnąco po `created_at`, potem po `id` — tak samo jak zapytanie w
        // kontrolerze), nie przez ponowne wywołanie `MessageResource`.
        $expected = [
            'data' => [
                [
                    'id' => $withSender->id,
                    'thread_id' => $thread->id,
                    'sender' => [
                        'id' => $supervisor->id,
                        'first_name' => $supervisor->first_name,
                        'last_name' => $supervisor->last_name,
                    ],
                    'body' => 'Wiadomość z nadawcą.',
                    'created_at' => $withSender->created_at->toIso8601ZuluString(),
                ],
                [
                    'id' => $withoutSender->id,
                    'thread_id' => $thread->id,
                    'sender' => null,
                    'body' => 'Wiadomość systemowa bez nadawcy.',
                    'created_at' => $withoutSender->created_at->toIso8601ZuluString(),
                ],
            ],
            'meta' => [
                'current_page' => 1,
                'per_page' => 25,
                'total' => 2,
                'last_page' => 1,
                'extra' => [
                    'thread_id' => $thread->id,
                    'type' => 'individual',
                    'read_only' => false,
                ],
            ],
        ];

        $this->assertSame($expected, $response->json());
    }
}
