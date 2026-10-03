<?php

namespace Tests\Feature\Emails;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Support\Emails\EmailRenderer;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Kopia e-maila w skrzynce (`emails`, stan „simulated”) powstaje z szablonu,
 * a dzwonek zostaje dokładnie taki jak dotąd. E-maile usunięte z treści
 * (E-06, E-07, E-28) nie tworzą wiersza w skrzynce.
 */
class NotifyEmailCopyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.frontend_url' => EmailTemplatesTest::BASE_URL]);
    }

    public function test_outbox_row_carries_the_rendered_template_and_the_bell_stays_as_it_was(): void
    {
        $user = User::factory()->create();

        $notification = Notify::send(
            $user,
            'assignment.created',
            'Przypisano Cię jako prowadzącego',
            'Treść dzwonka bez zmian.',
            '/panel/prowadzacy',
            email: ['courseTitle' => 'Pierwsza pomoc psychologiczna'],
        );

        $this->assertInstanceOf(Notification::class, $notification);
        $this->assertDatabaseHas('notifications', [
            'id' => $notification->id,
            'type' => 'assignment.created',
            'title' => 'Przypisano Cię jako prowadzącego',
            'body' => 'Treść dzwonka bez zmian.',
            'link' => '/panel/prowadzacy',
        ]);

        $row = EmailMessage::query()->where('related_id', $notification->id)->sole();
        $expected = EmailRenderer::render('E-08', ['courseTitle' => 'Pierwsza pomoc psychologiczna']);

        $this->assertSame('PsychON: nowy kurs do prowadzenia', $row->subject);
        $this->assertSame($expected->fragment, $row->body_html);
        $this->assertSame('simulated', $row->status);
        $this->assertSame($user->email, $row->to_email);
    }

    public function test_type_with_two_templates_uses_the_one_named_by_the_caller(): void
    {
        $user = User::factory()->create();
        $data = ['date' => '8 października 2026', 'time' => '18:00'];

        Notify::send($user, 'supervision.slot_cancelled', 'Termin superwizji odwołany', 'Treść.', '/panel/superwizja', email: $data);
        Notify::send($user, 'supervision.slot_cancelled', 'Termin superwizji odwołany', 'Treść.', '/prowadzacy/grupa', email: $data + ['template' => 'E-27']);

        $this->assertSame(
            ['PsychON: termin superwizji odwołany', 'PsychON: Twój termin superwizji odwołany'],
            EmailMessage::query()->where('to_user_id', $user->id)->orderBy('id')->pluck('subject')->all(),
        );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function removedEmails(): array
    {
        return [
            'E-06 application.accepted' => ['application.accepted'],
            'E-07 application.rejected' => ['application.rejected'],
            'E-28 message.received' => ['message.received'],
        ];
    }

    #[DataProvider('removedEmails')]
    public function test_removed_e_mails_produce_no_outbox_row_but_keep_the_bell(string $type): void
    {
        $user = User::factory()->create();

        $notification = Notify::send($user, $type, 'Tytuł', 'Treść.', '/panel');

        $this->assertInstanceOf(Notification::class, $notification);
        $this->assertDatabaseHas('notifications', ['id' => $notification->id, 'type' => $type, 'title' => 'Tytuł']);
        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_a_kept_e_mail_still_produces_an_outbox_row(): void
    {
        $user = User::factory()->create();

        Notify::send($user, 'internship.accepted', 'Wpis stażu zaakceptowany', 'Treść.', '/panel/staz');

        $this->assertSame(1, EmailMessage::query()->count());
        $this->assertSame('PsychON: wpis stażu zatwierdzony', EmailMessage::query()->value('subject'));
    }

    public function test_person_preference_still_skips_the_e_mail_copy(): void
    {
        $user = User::factory()->create();
        NotificationPreference::create(['user_id' => $user->id, 'type' => 'internship.accepted', 'email' => false]);

        Notify::send($user, 'internship.accepted', 'Wpis stażu zaakceptowany', 'Treść.', '/panel/staz');

        $this->assertSame(1, Notification::query()->count());
        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_call_without_template_data_keeps_working_with_the_former_copy(): void
    {
        Log::spy();
        $user = User::factory()->create();

        $notification = Notify::send($user, 'course.unlocked', 'Kurs odblokowany', "Treść <b>\nz nową linią.");

        $this->assertInstanceOf(Notification::class, $notification);
        $row = EmailMessage::query()->sole();
        $this->assertSame('Kurs odblokowany', $row->subject);
        $this->assertSame(nl2br(e("Treść <b>\nz nową linią.")), $row->body_html);
        Log::shouldHaveReceived('warning')->withArgs(
            fn (string $message, array $context): bool => $message === 'email.template_data_missing'
                && $context['template'] === 'E-11'
                && $context['missing'] === ['stageNumber', 'stageTitle', 'path'],
        )->once();
    }
}
