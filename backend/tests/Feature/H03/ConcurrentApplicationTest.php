<?php

namespace Tests\Feature\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\Edition;
use App\Models\User;
use App\Services\H03\ApplicationAcceptor;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ConcurrentApplicationTest extends TestCase
{
    use DatabaseMigrations;

    public function test_last_edition_seat_is_awarded_to_only_one_concurrent_acceptance(): void
    {
        if (! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Test współbieżności wymaga rozszerzenia pcntl.');
        }

        $edition = Edition::factory()->create(['status' => 'active', 'seats_limit' => 1]);
        $applications = Application::factory()->count(2)->create(['edition_id' => $edition->id]);
        $actors = User::factory()->count(2)->role('project_manager')->create();
        $directory = sys_get_temp_dir().'/h03-concurrency-'.uniqid('', true);
        mkdir($directory);
        $go = $directory.'/go';
        $children = [];

        foreach ($applications as $index => $application) {
            $pid = pcntl_fork();
            if ($pid === -1) {
                $this->fail('Nie udało się uruchomić procesu testu współbieżności H03.');
            }
            if ($pid === 0) {
                DB::purge();
                file_put_contents($directory.'/ready-'.$index, 'ready');
                while (! file_exists($go)) {
                    usleep(1000);
                }

                try {
                    ApplicationAcceptor::accept(
                        $application->id,
                        User::query()->findOrFail($actors[$index]->id),
                        ['role' => 'volunteer'],
                    );
                    file_put_contents($directory.'/result-'.$index, '201');
                } catch (ApiException $exception) {
                    file_put_contents($directory.'/result-'.$index, (string) $exception->status);
                } catch (\Throwable) {
                    file_put_contents($directory.'/result-'.$index, '500');
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

        $results = array_map(
            static fn (string $path): string => trim((string) file_get_contents($path)),
            glob($directory.'/result-*'),
        );

        $this->assertSame(1, count(array_filter($results, static fn (string $result): bool => $result === '201')));
        $this->assertSame(1, count(array_filter($results, static fn (string $result): bool => $result === '409')));
        $this->assertSame(1, User::where('edition_id', $edition->id)->where('role', 'volunteer')->count());
        $this->assertSame(1, Application::where('edition_id', $edition->id)->accepted()->count());

        foreach (glob($directory.'/*') as $file) {
            @unlink($file);
        }
        @rmdir($directory);
    }
}
