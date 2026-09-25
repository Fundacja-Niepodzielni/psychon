<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\InvalidationStore;
use App\Services\Keycloak\KeycloakBackchannelInvalidation;
use App\Services\Keycloak\KeycloakSessionRegistry;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Mockery;
use Mockery\MockInterface;
use RuntimeException;
use Throwable;

/**
 * Both collaborators are final, so Mockery cannot replace them; the real
 * store and registry are used and the `DB` facade underneath them is
 * mocked instead. No database connection is opened.
 */
class KeycloakBackchannelInvalidationTest extends TestCase
{
    private KeycloakBackchannelInvalidation $check;

    protected function setUp(): void
    {
        parent::setUp();

        Log::spy();
        $this->check = new KeycloakBackchannelInvalidation(new InvalidationStore, new KeycloakSessionRegistry);
    }

    public function test_a_token_without_sid_passes_without_touching_storage(): void
    {
        DB::shouldReceive('table')->never();

        $this->assertNull($this->check->check(null, 'sub-1'));
        $this->assertNull($this->check->check('', 'sub-1'));
    }

    public function test_an_unreadable_marker_store_refuses_and_raises_the_alarm(): void
    {
        $this->markerStore(new RuntimeException('connection refused'));
        DB::shouldReceive('table')->with('keycloak_sessions')->never();

        $this->assertSame(
            KeycloakBackchannelInvalidation::CAUSE_CHECK_UNAVAILABLE,
            $this->check->check('sid-1', 'sub-1'),
        );
        Log::shouldHaveReceived('critical')->once()->with(
            'keycloak.backchannel_logout.invalidation_store_unavailable',
            ['path' => 'read', 'reason' => 'connection refused', 'sid' => 'sid-1'],
        );
    }

    public function test_a_marked_session_is_refused_and_its_row_removed(): void
    {
        $this->markerStore(true);
        $this->sessionTable()->shouldReceive('delete')->once()->andReturn(1);

        $this->assertSame(
            KeycloakBackchannelInvalidation::CAUSE_INVALIDATED,
            $this->check->check('sid-1', 'sub-1'),
        );
    }

    public function test_a_failed_cleanup_does_not_turn_a_refusal_into_an_error(): void
    {
        $this->markerStore(true);
        $this->sessionTable()->shouldReceive('delete')->andThrow(new RuntimeException('table missing'));

        $this->assertSame(
            KeycloakBackchannelInvalidation::CAUSE_INVALIDATED,
            $this->check->check('sid-1', 'sub-1'),
        );
        Log::shouldHaveReceived('warning')->once()->with(
            'keycloak.backchannel_logout.session_cleanup_failed',
            ['message' => 'table missing'],
        );
    }

    public function test_an_unmarked_session_passes_and_is_recorded(): void
    {
        $this->markerStore(false);
        $sessions = Mockery::mock(Builder::class);
        $sessions->shouldReceive('updateOrInsert')
            ->once()
            ->with(['sid' => 'sid-1'], Mockery::on(fn (array $values): bool => $values['sub'] === 'sub-1'))
            ->andReturn(true);
        DB::shouldReceive('table')->with('keycloak_sessions')->andReturn($sessions);

        $this->assertNull($this->check->check('sid-1', 'sub-1'));
        Log::shouldNotHaveReceived('critical');
    }

    public function test_a_failed_bookkeeping_write_still_lets_the_request_through(): void
    {
        $this->markerStore(false);
        DB::shouldReceive('table')->with('keycloak_sessions')->andThrow(new RuntimeException('read-only'));

        $this->assertNull($this->check->check('sid-1', 'sub-1'));
        Log::shouldHaveReceived('warning')->once()->with(
            'keycloak.backchannel_logout.session_touch_failed',
            ['message' => 'read-only'],
        );
    }

    private function markerStore(bool|Throwable $marked): void
    {
        if ($marked instanceof Throwable) {
            DB::shouldReceive('table')->with('keycloak_logout_markers')->andThrow($marked);

            return;
        }

        $markers = Mockery::mock(Builder::class);
        $markers->shouldReceive('where')->with('sid', 'sid-1')->andReturnSelf();
        $markers->shouldReceive('exists')->andReturn($marked);
        DB::shouldReceive('table')->with('keycloak_logout_markers')->andReturn($markers);
    }

    private function sessionTable(): MockInterface
    {
        $sessions = Mockery::mock(Builder::class);
        $sessions->shouldReceive('where')->with('sid', 'sid-1')->andReturnSelf();
        DB::shouldReceive('table')->with('keycloak_sessions')->andReturn($sessions);

        return $sessions;
    }
}
