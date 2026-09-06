<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * H16 criterion 4: the sent-mailbox (#/admin/emails) is administration-only
 * and shows recipient, subject, body and time.
 */
class AdminEmailsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_simulated_emails_with_recipient_subject_body_and_time(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $marta = User::factory()->create(['email' => 'marta@demo.pl']);

        Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Możesz zacząć etap 2.', '/panel/kursy/2');

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/emails');

        $response->assertOk()->assertJsonFragment([
            'to_email' => 'marta@demo.pl',
            'subject' => 'Kurs odblokowany',
            'status' => 'simulated',
        ]);

        $email = collect($response->json('data'))->firstWhere('to_email', 'marta@demo.pl');
        $this->assertNotEmpty($email['body_html']);
        $this->assertNotEmpty($email['sent_at']);
    }

    public function test_project_manager_can_also_list_emails(): void
    {
        $pm = User::factory()->create(['role' => 'project_manager']);

        $this->actingAs($pm, 'sanctum')->getJson('/api/v1/admin/emails')->assertOk();
    }

    public function test_non_admin_role_is_forbidden_from_the_email_inbox(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($volunteer, 'sanctum')->getJson('/api/v1/admin/emails')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_email_inbox_requires_authentication(): void
    {
        $this->getJson('/api/v1/admin/emails')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }
}
