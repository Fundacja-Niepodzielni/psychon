<?php

namespace Tests\Unit\Services\H08;

use App\Services\H08\RollbackPreview;
use Exception;
use PHPUnit\Framework\TestCase;

class RollbackPreviewTest extends TestCase
{
    public function test_it_carries_the_measured_states(): void
    {
        $states = ['17:2' => 'in_progress', '17:3' => 'locked'];

        $preview = new RollbackPreview($states);

        $this->assertSame($states, $preview->states);
    }

    public function test_it_accepts_an_empty_measurement(): void
    {
        $this->assertSame([], (new RollbackPreview([]))->states);
    }

    public function test_it_is_an_exception_with_a_fixed_message(): void
    {
        $preview = new RollbackPreview(['1:1' => 'completed']);

        $this->assertInstanceOf(Exception::class, $preview);
        $this->assertSame(
            'Podgląd wpływu zmiany kolejności — transakcja celowo wycofana.',
            $preview->getMessage(),
        );
        $this->assertNull($preview->getPrevious());
    }
}
