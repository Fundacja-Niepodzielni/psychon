<?php

namespace Tests\Feature\AccessExpiry;

use App\Models\AccessDateChange;
use App\Models\AuditLogEntry;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * POST /admin/users/{id}/extend-access na koncie zanonimizowanym: odmowa
 * `409 account_anonymized` bez żadnego zapisu — ani daty, ani powodu, ani
 * audytu, powiadomienia czy e-maila. Odmowa pada przed walidacją ciała.
 */
class ExtendAccessAnonymizedAccountTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const MESSAGE = 'Kontu zanonimizowanemu nie można zmienić daty dostępu.';

    private const REASON = 'Przedłużenie na prośbę osoby, uzgodnione z prowadzącym.';

    private function anonymized(string $role, string $status): User
    {
        return User::factory()->create([
            'role' => $role,
            'status' => $status,
            'anonymized_at' => now(),
            'access_expires_at' => '2027-01-15 00:00:00',
        ]);
    }

    private function assertNothingWritten(User $person, string $status, int $changes, int $audits, int $notifications, int $emails): void
    {
        $person->refresh();

        $this->assertSame($status, $person->status);
        $this->assertSame('2027-01-15', $person->access_expires_at->toDateString());
        $this->assertSame($changes, AccessDateChange::query()->count());
        $this->assertSame($audits, AuditLogEntry::query()->count());
        $this->assertSame($notifications, Notification::query()->count());
        $this->assertSame($emails, EmailMessage::query()->count());
    }

    public function test_an_anonymized_account_is_refused_with_409_and_nothing_is_written(): void
    {
        $this->actingAsRole('project_manager');

        foreach (['deleted', 'blocked'] as $status) {
            $person = $this->anonymized('volunteer', $status);

            foreach ([
                ['months' => 3, 'reason' => self::REASON],
                ['until' => '2027-06-01', 'reason' => self::REASON],
            ] as $body) {
                $changes = AccessDateChange::query()->count();
                $audits = AuditLogEntry::query()->count();
                $notifications = Notification::query()->count();
                $emails = EmailMessage::query()->count();

                $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", $body)
                    ->assertStatus(409)
                    ->assertJsonPath('error.code', 'account_anonymized')
                    ->assertJsonPath('error.message', self::MESSAGE);

                $this->assertNothingWritten($person, $status, $changes, $audits, $notifications, $emails);
            }

            $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->where('subject_id', $person->id)->count());
        }
    }

    public function test_the_refusal_comes_before_the_body_is_validated(): void
    {
        $this->actingAsRole('super_admin');
        $person = $this->anonymized('student', 'deleted');

        foreach ([[], ['reason' => ''], ['until' => '2000-01-01', 'reason' => self::REASON], ['months' => 99, 'reason' => self::REASON]] as $body) {
            $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", $body)
                ->assertStatus(409)
                ->assertJsonPath('error.code', 'account_anonymized');
        }

        $this->assertNothingWritten($person, 'deleted', 0, 0, 0, 0);
    }

    public function test_an_anonymized_account_without_a_term_is_refused_as_anonymized_not_as_without_a_date(): void
    {
        $this->actingAsRole('project_manager');
        $person = $this->anonymized('instructor', 'deleted');

        $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", ['months' => 1, 'reason' => self::REASON])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'account_anonymized');

        $this->assertNothingWritten($person, 'deleted', 0, 0, 0, 0);
    }

    public function test_the_hierarchy_comes_before_the_anonymized_account_refusal(): void
    {
        $this->actingAsRole('project_manager');
        $person = $this->anonymized('super_admin', 'deleted');

        $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", ['months' => 1, 'reason' => self::REASON])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden')
            ->assertJsonPath('error.message', 'Tylko Super Admin może zarządzać kontami Super Admina.');

        $this->assertNothingWritten($person, 'deleted', 0, 0, 0, 0);
    }

    public function test_an_account_anonymized_between_the_check_and_the_write_is_refused_and_nothing_is_written(): void
    {
        $this->actingAsRole('project_manager');
        $person = User::factory()->create([
            'role' => 'volunteer',
            'status' => 'active',
            'access_expires_at' => '2027-01-15 00:00:00',
        ]);

        // Konto zostaje zanonimizowane tuż po pierwszym odczycie (sprawdzenie przed
        // walidacją); zapis w transakcji widzi już zmieniony wiersz.
        $fired = false;
        User::retrieved(static function (User $retrieved) use (&$fired, $person): void {
            if ($fired || $retrieved->id !== $person->id) {
                return;
            }

            $fired = true;
            DB::table('users')->where('id', $person->id)->update(['anonymized_at' => now()]);
        });

        $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", ['months' => 2, 'reason' => self::REASON])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'account_anonymized')
            ->assertJsonPath('error.message', self::MESSAGE);

        $this->assertTrue($fired);
        $this->assertNothingWritten($person, 'active', 0, 0, 0, 0);
    }

    public function test_a_not_anonymized_account_is_still_extended(): void
    {
        $this->actingAsRole('project_manager');
        $person = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => '2027-01-15 00:00:00']);

        $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", ['until' => '2027-06-01', 'reason' => self::REASON])
            ->assertOk();

        $this->assertSame(1, AccessDateChange::query()->where('user_id', $person->id)->count());
    }
}
