<?php

namespace App\Services\H08;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Material;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Pakiet H08b · zapis materiału (plik na dysku + wiersz) i jego usunięcie.
 * Kontroler zostaje cienki, tak samo jak przy kursach i lekcjach.
 *
 * `size` i `mime` MUSZĄ być wypełnione: `MaterialResource` (H05) wystawia je
 * uczestnikowi, a pusty rozmiar wywraca listę materiałów na stronie kursu.
 *
 * Rejestr audytu kontraktu §3.2 nie ma slugów dla materiałów — jak przy
 * lekcjach, operacja zapisuje się jako `course.updated` na KURSIE, z rodzajem
 * operacji w `details.op`.
 */
final class MaterialStore
{
    /** `storage/app/private` (config/filesystems.php) — materiały nie są publiczne. */
    private const string DISK = 'local';

    public static function forLesson(Lesson $lesson, UploadedFile $file, ?string $name, User $actor): Material
    {
        return self::store($lesson->course_id, ['lesson_id' => $lesson->id], $file, $name, $actor);
    }

    public static function forCourse(Course $course, UploadedFile $file, ?string $name, User $actor): Material
    {
        return self::store($course->id, ['course_id' => $course->id], $file, $name, $actor);
    }

    public static function delete(Material $material, User $actor): void
    {
        $path = $material->file_path;
        $course = self::courseOf(self::courseIdOf($material));

        DB::transaction(function () use ($material, $course, $actor): void {
            $material->delete();

            self::audit($actor, $course, 'material.deleted', $material);
        });

        // Tabela `materials` nie ma `softDeletes`, więc usunięcie jest twarde.
        // Plik znika dopiero po zatwierdzeniu transakcji: odwrotna kolejność
        // zostawiłaby po nieudanym commicie wiersz bez pliku, a ta — co najwyżej
        // osierocony plik na dysku.
        Storage::disk(self::DISK)->delete($path);
    }

    /**
     * @param  array<string, int>  $owner  `lesson_id` albo `course_id` — materiał
     *                                     wisi przy jednym albo przy drugim, a
     *                                     `CourseDetailResource` (H05) zbiera oba
     *                                     do jednej tablicy kursu.
     */
    private static function store(?int $courseId, array $owner, UploadedFile $file, ?string $name, User $actor): Material
    {
        $course = self::courseOf($courseId);
        $originalName = $file->getClientOriginalName();
        $displayName = trim((string) $name);

        return DB::transaction(function () use ($course, $owner, $file, $displayName, $originalName, $actor): Material {
            $material = Material::create($owner + [
                'name' => $displayName !== '' ? $displayName : $originalName,
                'file_path' => $file->storeAs(self::directory($course), self::fileName($file), self::DISK),
                'mime' => $file->getMimeType() ?: $file->getClientMimeType(),
                'size' => (int) $file->getSize(),
            ]);

            self::audit($actor, $course, 'material.uploaded', $material);

            return $material;
        });
    }

    /** Katalog per kurs — konwencja seeda demo (`DemoSeeder`: `materials/{slug}/…`). */
    private static function directory(?Course $course): string
    {
        return 'materials/'.($course?->slug ?? 'bez-kursu');
    }

    /**
     * Prefiks ULID rozwiązuje kolizje nazw w katalogu kursu. Reszta nazwy idzie
     * przez `Str::slug`, bo pochodzi od klienta i nie może wnieść separatorów
     * ścieżki — oryginał zostaje nietknięty w kolumnie `name`.
     */
    private static function fileName(UploadedFile $file): string
    {
        $base = Str::slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'material';
        $extension = Str::lower($file->getClientOriginalExtension());

        return Str::lower((string) Str::ulid()).'-'.$base.($extension !== '' ? '.'.$extension : '');
    }

    /**
     * Materiał wisi przy kursie albo przy lekcji; audytowany jest zawsze kurs.
     * `withTrashed()`, bo miękkie usunięcie lekcji nie kaskaduje na materiały —
     * bez niego materiał usuniętej lekcji zgubiłby podmiot audytu.
     */
    private static function courseIdOf(Material $material): ?int
    {
        if ($material->course_id !== null) {
            return $material->course_id;
        }

        if ($material->lesson_id === null) {
            return null;
        }

        return Lesson::withTrashed()->whereKey($material->lesson_id)->value('course_id');
    }

    /** Miękko usunięty kurs nadal jest poprawnym podmiotem wpisu audytowego. */
    private static function courseOf(?int $courseId): ?Course
    {
        return $courseId === null ? null : Course::withTrashed()->find($courseId);
    }

    private static function audit(User $actor, ?Course $course, string $op, Material $material): void
    {
        AuditLog::record($actor, 'course.updated', $course, [
            'op' => $op,
            'material_id' => $material->id,
            'lesson_id' => $material->lesson_id,
        ]);
    }
}
