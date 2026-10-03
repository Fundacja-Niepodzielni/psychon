<?php

namespace Tests\Feature\Notifications;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use App\Support\Emails\EmailRenderer;
use App\Support\Emails\EmailTemplates;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Emails\EmailTemplatesTest;
use Tests\TestCase;

/**
 * H16 criterion 1 (★): Notify::send of any type from contract §3.1 produces
 * a bell notification with a working link plus a simulated e-mail record.
 * The bus itself does not know about senders — it must behave identically
 * for every registered type. The e-mail record is the type's template
 * rendered with the caller's data; a type whose e-mail the approved content
 * removed (bell only) gets no e-mail record.
 */
class NotifySendTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Notification type registry — contract §3.1, the only source of truth.
     */
    public static function contractTypes(): array
    {
        return [
            'application.accepted' => ['application.accepted'],
            'application.rejected' => ['application.rejected'],
            'assignment.created' => ['assignment.created'],
            'assignment.removed' => ['assignment.removed'],
            'course.invited' => ['course.invited'],
            'course.unlocked' => ['course.unlocked'],
            'question.asked' => ['question.asked'],
            'question.answered' => ['question.answered'],
            'internship.accepted' => ['internship.accepted'],
            'internship.returned' => ['internship.returned'],
            'attempt.failed_final' => ['attempt.failed_final'],
            'certificate.ready' => ['certificate.ready'],
            'document.ready' => ['document.ready'],
            'profile.accepted' => ['profile.accepted'],
            'profile.returned' => ['profile.returned'],
            'export.ready' => ['export.ready'],
        ];
    }

    #[DataProvider('contractTypes')]
    public function test_notify_send_creates_notification_and_simulated_email(string $type): void
    {
        $user = User::factory()->create();
        $number = EmailTemplates::BELL_ONLY[$type] ?? EmailTemplates::forNotification($type);
        $data = EmailTemplatesTest::exampleData()[$number] ?? [];

        $notification = Notify::send($user, $type, 'Tytuł testowy', 'Treść testowa.', '/panel/cel', email: $data);

        $this->assertInstanceOf(Notification::class, $notification);
        $this->assertDatabaseHas('notifications', [
            'id' => $notification->id,
            'user_id' => $user->id,
            'type' => $type,
            'title' => 'Tytuł testowy',
            'body' => 'Treść testowa.',
            'link' => '/panel/cel',
        ]);
        $this->assertNull($notification->read_at);

        if (EmailTemplates::isBellOnly($type)) {
            $this->assertSame(0, EmailMessage::query()->count());
        } else {
            $rendered = EmailRenderer::render($number, $data);

            $this->assertDatabaseHas('emails', [
                'to_email' => $user->email,
                'to_user_id' => $user->id,
                'subject' => $rendered->subject,
                'body_html' => $rendered->fragment,
                'status' => 'simulated',
                'related_type' => $notification->getMorphClass(),
                'related_id' => $notification->id,
            ]);

            $email = EmailMessage::where('related_id', $notification->id)->firstOrFail();
            $this->assertNotNull($email->sent_at);
        }

        // The bell endpoint surfaces the same notification with a working link.
        $response = $this->actingAs($user, 'keycloak')->getJson('/api/v1/notifications');

        $response->assertOk()->assertJsonFragment([
            'id' => $notification->id,
            'type' => $type,
            'link' => '/panel/cel',
        ]);
    }
}
