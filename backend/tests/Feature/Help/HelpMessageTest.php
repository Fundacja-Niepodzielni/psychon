<?php

namespace Tests\Feature\Help;

use App\Mail\HelpMessageConfirmation;
use App\Mail\HelpMessageReceived;
use App\Models\HelpMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Zaplecze czatu pomocy (`POST /api/v1/help-messages`).
 *
 * Kryterium 1 — zalogowana osoba wysyla wiadomosc z okna pomocy.
 * Kryterium 2 — wiadomosc trafia (zakolejkowana) do skrzynki zespolu,
 * na adres z konfiguracji, nigdy wpisany na sztywno w kodzie.
 * Kryterium 3 — kopia niesie informacje kto (rola z tokena) i z ktorego
 * ekranu wyslal zgloszenie.
 * Kryterium 4 — nadawca dostaje osobne potwierdzenie, a odpowiedz niesie
 * numer zgloszenia.
 * Kryterium 5 — bez tokena: 401.
 * Kryterium 6 — pusta tresc: 422 z komunikatem przy polu `content`.
 */
class HelpMessageTest extends TestCase
{
    use RefreshDatabase;

    private const INBOX = 'skrzynka-testowa@przyklad.test';

    protected function setUp(): void
    {
        parent::setUp();

        // Adres skrzynki NIGDY nie jest wpisany na sztywno w kodzie produkcyjnym —
        // tu ustawiamy go jawnie w konfiguracji testu, zeby kryterium 2 wykrylo
        // kazda probe zaszycia adresu w kodzie (wyslanie pojdzie wtedy na INNY
        // adres niz ten, ktory tu ustawiamy).
        Config::set('help.inbox', self::INBOX);
    }

    public function test_logged_in_user_sends_a_message_from_the_help_window(): void
    {
        Mail::fake();

        $user = User::factory()->role('volunteer')->create();
        $this->actingAs($user, 'keycloak');

        $response = $this->postJson('/api/v1/help-messages', [
            'content' => 'Nie moge otworzyc lekcji 3.',
            'screen' => '/panel/lekcje/3',
        ]);

        $response->assertCreated()
            ->assertJsonStructure(['data' => ['id', 'reference', 'created_at']]);

        $reference = $response->json('data.reference');
        $this->assertNotEmpty($reference);

        $this->assertDatabaseHas('help_messages', [
            'id' => $response->json('data.id'),
            'user_id' => $user->id,
            'role' => 'volunteer',
            'screen' => '/panel/lekcje/3',
            'content' => 'Nie moge otworzyc lekcji 3.',
            'reference' => $reference,
        ]);
    }

    public function test_message_is_queued_to_the_team_inbox_from_configuration(): void
    {
        Mail::fake();

        $user = User::factory()->role('volunteer')->create();
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/help-messages', [
            'content' => 'Potrzebuje pomocy z platnoscia.',
            'screen' => '/panel/platnosci',
        ])->assertCreated();

        Mail::assertQueued(
            HelpMessageReceived::class,
            fn (HelpMessageReceived $mail): bool => $mail->hasTo(self::INBOX),
        );
    }

    public function test_team_inbox_copy_carries_who_and_which_screen(): void
    {
        Mail::fake();

        $user = User::factory()->role('instructor')->create();
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/help-messages', [
            'content' => 'Nagranie sie nie odtwarza.',
            'screen' => '/panel/prowadzacy/nagrania',
        ])->assertCreated();

        Mail::assertQueued(
            HelpMessageReceived::class,
            function (HelpMessageReceived $mail): bool {
                $mail->assertSeeInHtml('instructor');
                $mail->assertSeeInHtml('/panel/prowadzacy/nagrania');

                return true;
            },
        );
    }

    public function test_sender_gets_a_confirmation_and_the_reference_in_the_response(): void
    {
        Mail::fake();

        $user = User::factory()->role('volunteer')->create();
        $this->actingAs($user, 'keycloak');

        $response = $this->postJson('/api/v1/help-messages', [
            'content' => 'Jak zresetowac postep w kursie?',
            'screen' => '/panel/kursy',
        ])->assertCreated();

        $reference = $response->json('data.reference');
        $this->assertNotEmpty($reference);

        Mail::assertQueued(
            HelpMessageConfirmation::class,
            fn (HelpMessageConfirmation $mail): bool => $mail->hasTo($user->email)
                && $mail->helpMessage->reference === $reference,
        );
    }

    public function test_guest_cannot_send_a_help_message(): void
    {
        Mail::fake();

        $this->postJson('/api/v1/help-messages', [
            'content' => 'Wiadomosc bez tokena.',
            'screen' => '/panel',
        ])
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertDatabaseCount('help_messages', 0);
        Mail::assertNothingQueued();
    }

    public function test_blank_content_is_rejected_with_a_field_level_message(): void
    {
        Mail::fake();

        $user = User::factory()->role('volunteer')->create();
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/help-messages', [
            'content' => '',
            'screen' => '/panel',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['content']]]);

        $this->assertSame(0, HelpMessage::query()->count());
        Mail::assertNothingQueued();
    }
}
