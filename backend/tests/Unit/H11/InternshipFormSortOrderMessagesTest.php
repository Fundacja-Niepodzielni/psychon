<?php

namespace Tests\Unit\H11;

use App\Http\Requests\H11\Concerns\InternshipFormRules;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Komunikaty pola `sort_order` słownika form stażu, mierzone bez bazy: prawdziwy
 * walidator dostaje reguły i komunikaty z `InternshipFormRules` — te same, z
 * których korzystają żądanie tworzenia i żądanie edycji.
 *
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/H11/InternshipFormSortOrderMessagesTest.php`
 */
class InternshipFormSortOrderMessagesTest extends TestCase
{
    /**
     * @return array<string, array{0: bool, 1: mixed, 2: string}>
     */
    public static function invalidSortOrders(): array
    {
        $cases = [];

        foreach (['tworzenie' => false, 'edycja' => true] as $route => $partial) {
            $cases[$route.': wartość nieliczbowa'] = [$partial, 'abc', 'Miejsce na liście musi być liczbą całkowitą.'];
            $cases[$route.': wartość ujemna'] = [$partial, -1, 'Miejsce na liście nie może być ujemne.'];
            $cases[$route.': wartość ponad zakres'] = [$partial, 65536, 'Miejsce na liście jest zbyt duże.'];
        }

        return $cases;
    }

    #[DataProvider('invalidSortOrders')]
    public function test_sort_order_message_starts_with_the_name_of_the_field(bool $partial, mixed $value, string $message): void
    {
        $source = new class
        {
            use InternshipFormRules;

            /**
             * @return array<int, mixed>
             */
            public function sortOrderRules(bool $partial): array
            {
                return $this->formRules($partial, $partial ? 1 : null)['sort_order'];
            }
        };

        $validator = (new Factory(new Translator(new ArrayLoader, 'pl')))->make(
            ['sort_order' => $value],
            ['sort_order' => $source->sortOrderRules($partial)],
            $source->messages(),
        );

        $this->assertTrue($validator->fails());
        $this->assertSame($message, $validator->errors()->get('sort_order')[0]);
    }

    public function test_no_sort_order_message_keeps_the_old_wording(): void
    {
        $source = new class
        {
            use InternshipFormRules;
        };

        $messages = array_filter(
            $source->messages(),
            static fn (string $key): bool => str_starts_with($key, 'sort_order.'),
            ARRAY_FILTER_USE_KEY,
        );

        $this->assertSame(['sort_order.integer', 'sort_order.min', 'sort_order.max'], array_keys($messages));

        foreach ($messages as $message) {
            $this->assertStringStartsWith('Miejsce na liście ', $message);
        }
    }
}
