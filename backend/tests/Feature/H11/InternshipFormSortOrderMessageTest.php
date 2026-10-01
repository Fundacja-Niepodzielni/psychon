<?php

namespace Tests\Feature\H11;

use App\Models\InternshipForm;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Treść komunikatu pola `sort_order` w słowniku form stażu.
 *
 * Ekran nazywa to pole „Miejsce na liście", więc komunikat pod polem ma zaczynać
 * się od tych samych słów. Mierzone są obie trasy (tworzenie i edycja), choć
 * obie biorą komunikaty z jednego miejsca: `InternshipFormRules::messages()`.
 *
 * `php artisan test --filter=InternshipFormSortOrderMessageTest`
 */
class InternshipFormSortOrderMessageTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, array{0: mixed, 1: string}>
     */
    public static function invalidSortOrders(): array
    {
        return [
            'wartość nieliczbowa' => ['abc', 'Miejsce na liście musi być liczbą całkowitą.'],
            'wartość ujemna' => [-1, 'Miejsce na liście nie może być ujemne.'],
            'wartość ponad zakres' => [65536, 'Miejsce na liście jest zbyt duże.'],
        ];
    }

    #[DataProvider('invalidSortOrders')]
    public function test_create_rejects_sort_order_with_the_message_named_after_the_field(mixed $value, string $message): void
    {
        $admin = User::factory()->role('project_manager')->create();

        $response = $this->actingAs($admin, 'keycloak')
            ->postJson('/api/v1/admin/internship/forms', ['name' => 'Nowa forma', 'sort_order' => $value]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertSame($message, $response->json('error.errors.sort_order.0'));
        $this->assertSame(0, InternshipForm::query()->count());
    }

    #[DataProvider('invalidSortOrders')]
    public function test_update_rejects_sort_order_with_the_message_named_after_the_field(mixed $value, string $message): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $form = InternshipForm::create(['name' => 'Czat', 'sort_order' => 3]);

        $response = $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/internship/forms/{$form->id}", ['sort_order' => $value]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertSame($message, $response->json('error.errors.sort_order.0'));
        $this->assertSame(3, $form->fresh()->sort_order);
    }
}
