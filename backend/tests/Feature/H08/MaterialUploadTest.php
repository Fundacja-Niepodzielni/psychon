<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Material;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H08b · wgrywanie i usuwanie materiałów w panelu administracji.
 *
 * Oczekiwane wartości pochodzą z karty pakietu (kryterium ★4: „Upload złego
 * typu/rozmiaru → 422; poprawny plik pobieralny podpisanym linkiem
 * u uczestnika"), z planu fazy 7 i z kontraktu API (§1.1 tabela kodów, §3.2
 * rejestr audytu) — nigdy z tego, co akurat zwraca kod.
 */
class MaterialUploadTest extends TestCase
{
    use RefreshDatabase;

    /** Kształt zasobu materiału w panelu wg planu fazy 7, pkt 5. */
    private const array RESOURCE_FIELDS = [
        'id',
        'name',
        'mime',
        'size',
        'lesson_id',
        'course_id',
        'created_at',
    ];

    /** Limit z planu fazy 7: 10 MB, czyli 10240 kilobajtów. */
    private const int LIMIT_KILOBYTES = 10240;

    protected function setUp(): void
    {
        parent::setUp();

        // Podmieniony przed jakimkolwiek zapisem, żeby suita nigdy nie pisała
        // do storage/app/private.
        Storage::fake('local');
    }

    public function test_volunteer_is_forbidden_on_the_material_upload(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('karta-pracy.pdf', '%PDF-1.4 demo'),
        ])->assertStatus(403)->assertJsonPath('error.code', 'forbidden');

        $this->assertSame(0, Material::count());
    }

    public function test_guest_is_unauthenticated(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    /**
     * Kryterium ★4, pierwsza połowa: zły typ. Panel nie może przyjąć dowolnego
     * pliku na dysk serwera — odmowa musi być błędem pola, nie awarią.
     */
    public function test_uploading_a_disallowed_file_type_is_rejected(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->create('zlosliwy.exe', 12),
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['file']]]);

        $this->assertSame(0, Material::count());
        $this->assertSame(0, AuditLogEntry::where('action', 'course.updated')->count());
        $this->assertSame([], Storage::disk('local')->allFiles('materials'));
    }

    /**
     * Kryterium ★4, druga połowa: przekroczony rozmiar.
     */
    public function test_uploading_a_file_over_the_ten_megabyte_limit_is_rejected(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->create('duzy.pdf', self::LIMIT_KILOBYTES + 1, 'application/pdf'),
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['file']]]);

        $this->assertSame(0, Material::count());
        $this->assertSame([], Storage::disk('local')->allFiles('materials'));
    }

    /** Granica jest inkluzywna: dokładnie 10 MB jeszcze przechodzi. */
    public function test_a_file_exactly_at_the_limit_is_accepted(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->create('rowno-10mb.pdf', self::LIMIT_KILOBYTES, 'application/pdf'),
        ])->assertCreated();

        $this->assertSame(1, Material::count());
    }

    /**
     * Kryterium ★4, druga część: „poprawny plik pobieralny podpisanym linkiem
     * u uczestnika". `size` i `mime` muszą być niepuste — `MaterialResource`
     * (H05) wystawia je uczestnikowi.
     */
    public function test_a_correct_lesson_upload_is_stored_with_size_and_mime_and_reaches_the_participant(): void
    {
        $course = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $lesson = $this->lesson($course);

        $admin = $this->actingAsAdmin();

        $contents = '%PDF-1.4 demo materiału';

        $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('Karta pracy.pdf', $contents),
        ])->assertCreated();

        $this->assertSame(self::RESOURCE_FIELDS, array_keys($response->json('data')));
        $this->assertSame('Karta pracy.pdf', $response->json('data.name'));
        $this->assertSame('application/pdf', $response->json('data.mime'));
        $this->assertSame(strlen($contents), $response->json('data.size'));
        $this->assertSame($lesson->id, $response->json('data.lesson_id'));
        $this->assertNull($response->json('data.course_id'));

        $material = Material::findOrFail($response->json('data.id'));
        $this->assertNotEmpty($material->mime, 'Puste `mime` wywraca pobieranie materiału u uczestnika.');
        $this->assertNotEmpty($material->size, 'Puste `size` wywraca listę materiałów u uczestnika.');
        $this->assertSame(strlen($contents), $material->size);

        // Katalog per kurs jest konwencją seeda; prefiks nazwy rozwiązuje kolizje.
        $this->assertStringStartsWith('materials/etap-1/', $material->file_path);
        $this->assertStringEndsWith('-karta-pracy.pdf', $material->file_path);
        Storage::disk('local')->assertExists($material->file_path);

        // Rejestr audytu §3.2 nie ma slugów dla materiałów: operacja zapisuje
        // się jako `course.updated` na kursie, z rodzajem w `details.op`.
        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('material.uploaded', $entry->details['op']);
        $this->assertSame($material->id, $entry->details['material_id']);
        $this->assertSame($lesson->id, $entry->details['lesson_id']);

        // Uczestnik: materiał lekcji zbiera `CourseDetailResource` do tablicy
        // `materials` kursu (kontrakt nie ma pola `materials` na lekcji).
        $volunteer = User::factory()->role('volunteer')->create();
        Sanctum::actingAs($volunteer);

        $item = $this->getJson('/api/v1/courses/etap-1')->assertOk()->json('data.materials.0');

        $this->assertSame($material->id, $item['id']);
        $this->assertSame('Karta pracy.pdf', $item['name']);
        $this->assertSame(strlen($contents), $item['size']);
        $this->assertIsString($item['download_url']);

        // Podpisany link H05 musi realnie oddać wgrane bajty — bez tego
        // kryterium ★4 kończy się na wpisie w bazie.
        $download = $this->get($item['download_url'])->assertOk();

        $this->assertSame('application/pdf', $download->headers->get('content-type'));
        $this->assertSame($contents, $download->streamedContent());
    }

    public function test_a_course_level_upload_is_attached_to_the_course(): void
    {
        $course = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($course);

        $this->actingAsAdmin();

        $response = $this->postJson("/api/v1/admin/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('Regulamin.pdf', '%PDF-1.4 regulamin'),
        ])->assertCreated();

        $this->assertSame($course->id, $response->json('data.course_id'));
        $this->assertNull($response->json('data.lesson_id'));

        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('material.uploaded', $entry->details['op']);
        $this->assertNull($entry->details['lesson_id']);

        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $names = collect($this->getJson('/api/v1/courses/etap-1')->assertOk()->json('data.materials'))
            ->pluck('name')
            ->all();

        $this->assertSame(['Regulamin.pdf'], $names);
    }

    public function test_an_explicit_name_replaces_the_original_file_name(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('scan-0001.pdf', '%PDF-1.4 skan'),
            'name' => 'Karta pracy — etap 1',
        ])->assertCreated()->assertJsonPath('data.name', 'Karta pracy — etap 1');
    }

    /**
     * Tabela `materials` nie ma `softDeletes`, więc usunięcie jest twarde —
     * musi zabrać ze sobą także plik, inaczej dysk rośnie w nieskończoność.
     */
    public function test_deleting_a_material_removes_the_row_and_the_file(): void
    {
        $course = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $lesson = $this->lesson($course);

        $admin = $this->actingAsAdmin();

        $materialId = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('Karta pracy.pdf', '%PDF-1.4 demo'),
        ])->assertCreated()->json('data.id');

        $path = Material::findOrFail($materialId)->file_path;

        $this->deleteJson("/api/v1/admin/materials/{$materialId}")
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $materialId, 'deleted' => true]]);

        $this->assertDatabaseMissing('materials', ['id' => $materialId]);
        Storage::disk('local')->assertMissing($path);

        $entry = AuditLogEntry::where('action', 'course.updated')
            ->orderByDesc('id')
            ->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('material.deleted', $entry->details['op']);
        $this->assertSame($materialId, $entry->details['material_id']);

        // Zniknął też z listy materiałów uczestnika.
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->assertSame([], $this->getJson('/api/v1/courses/etap-1')->assertOk()->json('data.materials'));
    }

    public function test_unknown_lesson_course_and_material_return_not_found(): void
    {
        $this->actingAsAdmin();

        $file = fn (): UploadedFile => UploadedFile::fake()->createWithContent('karta.pdf', '%PDF-1.4 demo');

        $this->postJson('/api/v1/admin/lessons/999999/materials', ['file' => $file()])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->postJson('/api/v1/admin/courses/999999/materials', ['file' => $file()])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->deleteJson('/api/v1/admin/materials/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function course(string $slug, array $attributes = []): Course
    {
        return Course::create($attributes + [
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function lesson(Course $course): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Pierwsza',
            'sequence_order' => 1,
            'duration_seconds' => 1800,
        ]);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        return $admin;
    }
}
