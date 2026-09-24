<?php

namespace Tests\Unit\Services\H14;

use App\Models\User;
use App\Services\H14\DocumentTypeGate;
use Illuminate\Foundation\Testing\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Covers `missingProfileFields()` only: it reads attributes of an in-memory
 * user. `for()` queries documents and the active edition, so it stays with
 * the Feature tests. The application is booted for the encrypted casts; no
 * database connection is opened.
 */
class DocumentTypeGateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);
    }

    public function test_a_complete_profile_has_no_missing_fields(): void
    {
        $this->assertSame([], DocumentTypeGate::missingProfileFields($this->user()));
    }

    #[DataProvider('blankValues')]
    public function test_a_blank_field_is_reported(?string $blank): void
    {
        $user = $this->user(['phone' => $blank]);

        $this->assertSame(['phone'], DocumentTypeGate::missingProfileFields($user));
    }

    /** @return array<string, array{?string}> */
    public static function blankValues(): array
    {
        return ['null' => [null], 'empty' => [''], 'whitespace' => ["  \t"]];
    }

    public function test_blank_encrypted_fields_are_reported(): void
    {
        $user = $this->user(['pesel' => null, 'address_zip' => ' ']);

        $this->assertSame(['pesel', 'address_zip'], DocumentTypeGate::missingProfileFields($user));
    }

    public function test_missing_fields_follow_the_required_order_without_gaps(): void
    {
        $user = $this->user(['address_city' => '', 'first_name' => null, 'email' => '']);

        $this->assertSame(
            ['first_name', 'email', 'address_city'],
            DocumentTypeGate::missingProfileFields($user),
        );
    }

    public function test_an_empty_profile_misses_every_required_field(): void
    {
        $this->assertSame(
            DocumentTypeGate::REQUIRED_PROFILE_FIELDS,
            DocumentTypeGate::missingProfileFields(new User),
        );
    }

    /** @param  array<string, ?string>  $overrides */
    private function user(array $overrides = []): User
    {
        return new User(array_replace([
            'first_name' => 'Marta',
            'last_name' => 'Demo',
            'email' => 'marta@demo.pl',
            'phone' => '+48 600 100 200',
            'pesel' => '90010112345',
            'address_street' => 'ul. Przykładowa 1',
            'address_city' => 'Warszawa',
            'address_zip' => '00-001',
        ], $overrides));
    }
}
