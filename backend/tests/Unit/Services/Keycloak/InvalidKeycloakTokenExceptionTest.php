<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\InvalidKeycloakTokenException;
use LogicException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class InvalidKeycloakTokenExceptionTest extends TestCase
{
    public function test_it_carries_the_reason_and_message(): void
    {
        $exception = new InvalidKeycloakTokenException('expired', 'The token has expired.');

        $this->assertInstanceOf(RuntimeException::class, $exception);
        $this->assertSame('expired', $exception->reason);
        $this->assertSame('The token has expired.', $exception->getMessage());
        $this->assertSame(0, $exception->getCode());
        $this->assertNull($exception->getPrevious());
    }

    public function test_it_keeps_the_previous_throwable(): void
    {
        $cause = new LogicException('library detail');

        $exception = new InvalidKeycloakTokenException('signature', 'Bad signature.', $cause);

        $this->assertSame($cause, $exception->getPrevious());
        $this->assertSame('signature', $exception->reason);
    }
}
