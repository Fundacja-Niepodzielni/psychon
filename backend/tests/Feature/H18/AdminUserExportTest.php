<?php

namespace Tests\Feature\H18;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H18 · GET /admin/users/export.csv — wspólny helper `Csv`
 * (BOM + `;`), te same filtry co lista (kryterium 1★).
 */
class AdminUserExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_csv_has_bom_semicolons_header_and_honours_role_filter(): void
    {
        $this->seed();
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        $response = $this->get('/api/v1/admin/users/export.csv?role=volunteer');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=utf-8');

        $body = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);
        $this->assertStringContainsString('id;first_name;last_name;email;role', $body);
        $this->assertStringContainsString('marta@demo.pl', $body);
        $this->assertStringNotContainsString('opiekun@demo.pl', $body);
    }

    public function test_export_requires_administration_role(): void
    {
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->get('/api/v1/admin/users/export.csv')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }
}
