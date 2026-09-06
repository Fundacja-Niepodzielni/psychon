<?php

namespace Tests\Unit\H03;

use App\Services\H03\ApplicationEmailNormalizer;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class ApplicationEmailNormalizerTest extends TestCase
{
    public function test_normalization_is_case_and_whitespace_insensitive(): void
    {
        $this->assertSame(
            'candidate@example.test',
            ApplicationEmailNormalizer::normalize('  Candidate@Example.Test '),
        );
    }

    public function test_empty_email_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);

        ApplicationEmailNormalizer::normalize('   ');
    }
}
