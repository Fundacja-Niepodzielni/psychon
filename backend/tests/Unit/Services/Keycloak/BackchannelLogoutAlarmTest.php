<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\BackchannelLogoutAlarm;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\Log;

/**
 * Boots the application for the array cache store and the log facade; no
 * database connection is opened.
 */
class BackchannelLogoutAlarmTest extends TestCase
{
    private const EVENT = 'keycloak.backchannel_logout.invalidation_store_unavailable';

    protected function setUp(): void
    {
        parent::setUp();

        config(['keycloak.alarm_throttle_seconds' => 60]);
        $this->freezeSecond();
        Log::spy();
    }

    public function test_the_first_alarm_is_logged_as_critical_with_its_context(): void
    {
        BackchannelLogoutAlarm::raise('read', 'connection refused', ['sid' => 'sid-1']);

        Log::shouldHaveReceived('critical')->once()->with(self::EVENT, [
            'path' => 'read',
            'reason' => 'connection refused',
            'sid' => 'sid-1',
        ]);
    }

    public function test_a_repeated_alarm_inside_the_window_is_throttled(): void
    {
        BackchannelLogoutAlarm::raise('read', 'down');
        $this->travel(59)->seconds();
        BackchannelLogoutAlarm::raise('read', 'still down');

        Log::shouldHaveReceived('critical')->once();
    }

    public function test_the_alarm_is_raised_again_in_the_next_window(): void
    {
        BackchannelLogoutAlarm::raise('write', null);
        $this->travel(61)->seconds();
        BackchannelLogoutAlarm::raise('write', null);

        Log::shouldHaveReceived('critical')->twice();
    }

    public function test_each_path_is_throttled_separately(): void
    {
        BackchannelLogoutAlarm::raise('read', 'down');
        BackchannelLogoutAlarm::raise('write', 'down');

        Log::shouldHaveReceived('critical')->with(self::EVENT, ['path' => 'read', 'reason' => 'down'])->once();
        Log::shouldHaveReceived('critical')->with(self::EVENT, ['path' => 'write', 'reason' => 'down'])->once();
    }

    public function test_the_window_length_comes_from_configuration(): void
    {
        config(['keycloak.alarm_throttle_seconds' => 5]);

        BackchannelLogoutAlarm::raise('read', 'down');
        $this->travel(6)->seconds();
        BackchannelLogoutAlarm::raise('read', 'down');

        Log::shouldHaveReceived('critical')->twice();
    }
}
