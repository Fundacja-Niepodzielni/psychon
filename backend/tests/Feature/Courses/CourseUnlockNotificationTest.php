<?php

namespace Tests\Feature\Courses;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The `course.unlocked` announcement — package criterion H05.3 and the
 * „no backfill" rule. Expected values come from docs/hackathon/01-pakiety-zadan.md
 * § H05, the notification-type registry (contract §3.1) and the canonical seed
 * (docs/hackathon/04-seed-demo.md §3), never from the notifier itself.
 */
class CourseUnlockNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_passing_stage_two_opens_stage_three_and_announces_it_exactly_once(): void
    {
        $marta = $this->user('marta@demo.pl');

        // Criterion H05.3 needs both halves of the unlock rule: demo:pass-test
        // only creates the attempt, the lessons come from H05's own command.
        $this->artisan('demo:complete-lessons', [
            'email' => 'marta@demo.pl',
            'courseSlug' => 'wywiad-psychologiczny',
        ])->assertSuccessful();

        $this->artisan('demo:pass-test', [
            'email' => 'marta@demo.pl',
            'courseSlug' => 'wywiad-psychologiczny',
        ])->assertSuccessful();

        Sanctum::actingAs($marta);

        $items = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))->keyBy('slug');

        $this->assertSame('in_progress', $items['interwencja-kryzysowa']['status']);

        $this->assertSame(1, $this->unlockNotifications($marta, '/panel/kursy/interwencja-kryzysowa')->count());

        // Stage 2 was announced by the seed and stage 1 is outside the rule —
        // opening the catalogue must not backfill either of them.
        $this->assertSame(2, $this->unlockNotifications($marta)->count());

        $this->getJson('/api/v1/courses')->assertOk();
        $this->getJson('/api/v1/courses')->assertOk();

        $this->assertSame(1, $this->unlockNotifications($marta, '/panel/kursy/interwencja-kryzysowa')->count());
        $this->assertSame(2, $this->unlockNotifications($marta)->count());
    }

    public function test_a_volunteer_with_no_progress_is_not_told_that_stage_one_opened(): void
    {
        // Stage 1 is never locked, so announcing it would name something that
        // was never shut. On the canonical seed the other guards happen to
        // cover this, so `sequence_order > 1` needs its own oracle: mutating it
        // to `>= 1` has to turn this test red.
        $fresh = User::factory()->create();

        Sanctum::actingAs($fresh);
        $this->getJson('/api/v1/courses')->assertOk();

        $this->assertSame(0, $this->unlockNotifications($fresh)->count());
    }

    public function test_reading_the_catalogue_as_a_graduate_announces_nothing(): void
    {
        $ola = $this->user('ola@demo.pl');

        $before = Notification::where('user_id', $ola->id)->count();

        Sanctum::actingAs($ola);
        $this->getJson('/api/v1/courses')->assertOk();

        $this->assertSame(0, $this->unlockNotifications($ola)->count());
        $this->assertSame($before, Notification::where('user_id', $ola->id)->count());
    }

    /**
     * @return Builder<Notification>
     */
    private function unlockNotifications(User $user, ?string $link = null): Builder
    {
        return Notification::query()
            ->where('user_id', $user->id)
            ->where('type', 'course.unlocked')
            ->when($link !== null, fn (Builder $query): Builder => $query->where('link', $link));
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
