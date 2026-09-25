<?php

namespace Tests\Unit\Services\H14;

use App\Exceptions\ApiException;
use App\Services\H14\DocumentIssuer;
use PHPUnit\Framework\TestCase;

/**
 * Covers `viewFor()` only: a pure lookup in the `VIEWS` map, no state and no
 * side effect. `issue()` locks the active edition row, reads/writes
 * `documents` and sends a notification, so it stays with the Feature tests
 * — this suite never boots the application and never opens a database
 * connection.
 */
class DocumentIssuerViewForTest extends TestCase
{
    public function test_a_known_document_type_resolves_to_its_view(): void
    {
        $this->assertSame('documents.volunteer-agreement', DocumentIssuer::viewFor('volunteer_agreement'));
        $this->assertSame('documents.internship-certificate', DocumentIssuer::viewFor('internship_certificate'));
    }

    public function test_an_unknown_document_type_is_refused_with_a_422(): void
    {
        try {
            DocumentIssuer::viewFor('nieznany_typ');
            $this->fail('Oczekiwano ApiException dla nieznanego typu dokumentu.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status);
            $this->assertSame('validation_failed', $e->errorCode);
        }
    }

    public function test_an_empty_document_type_is_also_refused(): void
    {
        $this->expectException(ApiException::class);

        DocumentIssuer::viewFor('');
    }
}
