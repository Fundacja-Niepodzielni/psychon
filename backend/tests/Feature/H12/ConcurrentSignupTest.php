<?php

namespace Tests\Feature\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Services\H12\SupervisionSignupService;
use App\Services\H12\SupervisorAssignmentService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ConcurrentSignupTest extends TestCase
{
    use DatabaseMigrations;

    public function test_ten_independent_transactions_never_exceed_three_seats(): void
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Test współbieżności wymaga rozszerzenia pcntl.');
        }

        $supervisor = User::factory()->role('instructor')->create();
        $slot = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id,
            'starts_at' => Carbon::now()->addDay(),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala testowa',
        ]);

        $volunteers = User::factory()->count(10)->create(['role' => 'volunteer']);
        foreach ($volunteers as $volunteer) {
            SupervisorAssignment::create([
                'volunteer_id' => $volunteer->id,
                'supervisor_id' => $supervisor->id,
                'assigned_at' => now(),
            ]);
        }

        $directory = sys_get_temp_dir().'/h12-concurrency-'.uniqid('', true);
        mkdir($directory);
        $go = $directory.'/go';
        $children = [];

        foreach ($volunteers as $volunteer) {
            $pid = pcntl_fork();
            if ($pid === -1) {
                $this->fail('Nie udało się uruchomić procesu testu współbieżności.');
            }

            if ($pid === 0) {
                DB::purge();
                $ready = $directory.'/ready-'.$volunteer->id;
                $result = $directory.'/result-'.$volunteer->id;
                file_put_contents($ready, 'ready');

                while (! file_exists($go)) {
                    usleep(1000);
                }

                try {
                    app(SupervisionSignupService::class)->signup(
                        User::query()->findOrFail($volunteer->id),
                        $slot->id,
                    );
                    file_put_contents($result, '201');
                } catch (ApiException $exception) {
                    file_put_contents($result, (string) $exception->status);
                } catch (\Throwable) {
                    file_put_contents($result, '500');
                }

                exit(0);
            }

            $children[] = $pid;
        }

        for ($attempt = 0; $attempt < 5000; $attempt++) {
            if (count(glob($directory.'/ready-*')) === 10) {
                break;
            }
            usleep(1000);
        }
        $this->assertCount(10, glob($directory.'/ready-*'));
        file_put_contents($go, 'go');

        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
        }

        $results = array_map(
            static fn (string $path): string => trim((string) file_get_contents($path)),
            glob($directory.'/result-*'),
        );

        $this->assertSame(3, count(array_filter($results, static fn (string $result): bool => $result === '201')));
        $this->assertSame(7, count(array_filter($results, static fn (string $result): bool => $result === '409')));
        $this->assertSame(3, SupervisionSlot::findOrFail($slot->id)->signups()->whereNull('cancelled_at')->count());

        foreach (glob($directory.'/*') as $file) {
            @unlink($file);
        }
        @rmdir($directory);
    }

    public function test_signup_and_supervisor_change_share_the_same_lock_order(): void
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Test współbieżności wymaga rozszerzenia pcntl.');
        }

        $oldSupervisor = User::factory()->role('instructor')->create();
        $newSupervisor = User::factory()->role('instructor')->create();
        $admin = User::factory()->role('project_manager')->create();
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $oldSupervisor->id,
            'assigned_at' => now(),
        ]);
        $slot = SupervisionSlot::create([
            'supervisor_id' => $oldSupervisor->id,
            'starts_at' => Carbon::now()->addDay(),
            'duration_minutes' => 90,
            'seats_limit' => 1,
            'location_or_link' => 'Sala testowa',
        ]);

        $directory = sys_get_temp_dir().'/h12-assignment-race-'.uniqid('', true);
        mkdir($directory);
        $go = $directory.'/go';
        $children = [];

        $operations = [
            'signup' => static function () use ($volunteer, $slot): string {
                try {
                    app(SupervisionSignupService::class)->signup(
                        User::query()->findOrFail($volunteer->id),
                        $slot->id,
                    );

                    return '201';
                } catch (ApiException $exception) {
                    return (string) $exception->status;
                }
            },
            'assign' => static function () use ($admin, $volunteer, $newSupervisor): string {
                try {
                    app(SupervisorAssignmentService::class)->assign(
                        User::query()->findOrFail($admin->id),
                        $volunteer->id,
                        $newSupervisor->id,
                    );

                    return '200';
                } catch (ApiException $exception) {
                    return (string) $exception->status;
                }
            },
        ];

        foreach ($operations as $name => $operation) {
            $pid = pcntl_fork();
            if ($pid === -1) {
                $this->fail('Nie udało się uruchomić procesu testu wyścigu przypisania.');
            }

            if ($pid === 0) {
                DB::purge();
                file_put_contents($directory.'/ready-'.$name, 'ready');

                while (! file_exists($go)) {
                    usleep(1000);
                }

                try {
                    file_put_contents($directory.'/result-'.$name, $operation());
                } catch (\Throwable) {
                    file_put_contents($directory.'/result-'.$name, '500');
                }

                exit(0);
            }

            $children[] = $pid;
        }

        for ($attempt = 0; $attempt < 5000; $attempt++) {
            if (count(glob($directory.'/ready-*')) === 2) {
                break;
            }
            usleep(1000);
        }
        $this->assertCount(2, glob($directory.'/ready-*'));
        file_put_contents($go, 'go');

        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
        }

        $results = [];
        foreach (['signup', 'assign'] as $name) {
            $results[$name] = trim((string) file_get_contents($directory.'/result-'.$name));
        }

        $this->assertSame('200', $results['assign']);
        $this->assertContains($results['signup'], ['201', '403']);
        $this->assertSame(1, SupervisorAssignment::where('volunteer_id', $volunteer->id)
            ->whereNull('unassigned_at')->count());
        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $newSupervisor->id,
            'unassigned_at' => null,
        ]);

        if ($results['signup'] === '201') {
            $this->assertDatabaseHas('supervision_signups', [
                'slot_id' => $slot->id,
                'user_id' => $volunteer->id,
                'cancelled_at' => null,
            ]);
        } else {
            $this->assertDatabaseMissing('supervision_signups', [
                'slot_id' => $slot->id,
                'user_id' => $volunteer->id,
            ]);
        }

        foreach (glob($directory.'/*') as $file) {
            @unlink($file);
        }
        @rmdir($directory);
    }
}
