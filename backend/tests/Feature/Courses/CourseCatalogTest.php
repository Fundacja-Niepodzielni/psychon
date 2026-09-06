<?php

namespace Tests\Feature\Courses;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/v1/courses — contract §2 „Kursy (H05)".
 * Expected values come from docs/hackathon/04-seed-demo.md §3 (canonical
 * demo state) and from the contract example, never from the serializer.
 */
class CourseCatalogTest extends TestCase
{
    use RefreshDatabase;

    /** Path stages 3-10 — locked for marta per the seed document §3. */
    private const array LOCKED_SLUGS = [
        'interwencja-kryzysowa',
        'praca-z-emocjami',
        'komunikacja-wspierajaca',
        'kryzys-suicydalny',
        'wsparcie-mlodziezy',
        'granice-i-etyka',
        'higiena-pracy-pomagacza',
        'superwizja-i-rozwoj',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_catalogue_statuses_match_the_canonical_seed(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $items = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))
            ->keyBy('slug');

        $this->assertSame('completed', $items['podstawy-pomocy']['status']);
        $this->assertSame(100, $items['podstawy-pomocy']['progress_percent']);

        $this->assertSame('in_progress', $items['wywiad-psychologiczny']['status']);
        $this->assertSame(40, $items['wywiad-psychologiczny']['progress_percent']);

        foreach (self::LOCKED_SLUGS as $slug) {
            $this->assertSame('locked', $items[$slug]['status'], "Etap {$slug} powinien być zablokowany.");
            $this->assertSame(0, $items[$slug]['progress_percent'], "Etap {$slug} powinien mieć 0% postępu.");
        }
    }

    public function test_catalogue_item_carries_exactly_the_contract_fields(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $response = $this->getJson('/api/v1/courses')->assertOk();

        $this->assertSame(
            ['id', 'slug', 'title', 'sequence_order', 'product_group', 'status', 'progress_percent'],
            array_keys($response->json('data.0')),
        );

        // The contract example of GET /courses carries no pagination envelope.
        $this->assertNull($response->json('meta'));
    }

    public function test_catalogue_is_ordered_by_sequence_with_courses_outside_it_last(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));

        $orders = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))
            ->pluck('sequence_order')
            ->all();

        $this->assertSame([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null], $orders);
    }

    public function test_product_group_filter_narrows_the_catalogue(): void
    {
        Course::create([
            'title' => 'Dobrostan — wstęp',
            'slug' => 'dobrostan-wstep',
            'type' => 'course',
            'product_group' => 'dobrostan',
            'sequence_order' => null,
            'is_published' => true,
        ]);

        // A user assigned to both product groups is not narrowed implicitly.
        Sanctum::actingAs(User::factory()->role('super_admin')->create(['product_group' => 'both']));

        $all = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))->pluck('slug');
        $this->assertContains('dobrostan-wstep', $all);
        $this->assertContains('podstawy-pomocy', $all);

        $filtered = collect($this->getJson('/api/v1/courses?product_group=dobrostan')->assertOk()->json('data'))
            ->pluck('slug')
            ->all();

        $this->assertSame(['dobrostan-wstep'], $filtered);
    }

    public function test_unknown_product_group_is_rejected(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));

        $this->getJson('/api/v1/courses?product_group=nieistniejaca')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
