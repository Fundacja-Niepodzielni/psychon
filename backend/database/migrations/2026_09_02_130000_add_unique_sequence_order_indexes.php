<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Unikalna kolejność w obrębie rodzica (indeks częściowy dla lekcji — miękkie usuwanie, zwykły dla pytań).
     *
     * Bez tego indeksu wyścig dwóch równoczesnych dodań kończył się nie błędem,
     * lecz dwoma wierszami o tym samym `sequence_order` — czyli kolejnością
     * materiału zależną od przypadku, bez żadnego objawu. Indeks jest tu
     * ostatecznym strażnikiem; serializację robią blokady wiersza rodzica.
     *
     * Pomiar przed założeniem (baza demo po seedzie, 02.09.2026): duplikatów
     * `(course_id, sequence_order)` w `lessons` — 0 przy 30 lekcjach w 11 kursach;
     * duplikatów `(test_id, sequence_order)` w `test_questions` — 0 przy 30
     * pytaniach w 3 testach. Krok renumerujący nie był potrzebny.
     *
     * Lekcje mają miękkie usuwanie, więc ich indeks jest CZĘŚCIOWY: usunięta
     * lekcja zachowuje swój numer, a numeracja liczy tylko żywe (`LessonWriter`),
     * więc pełny unikat blokowałby numer po każdym usunięciu. `test_questions`
     * miękkiego usuwania nie ma i indeks jest tam zwykły.
     */
    public function up(): void
    {
        DB::statement(
            'CREATE UNIQUE INDEX lessons_course_sequence_unique
             ON lessons (course_id, sequence_order)
             WHERE deleted_at IS NULL'
        );

        DB::statement(
            'CREATE UNIQUE INDEX test_questions_test_sequence_unique
             ON test_questions (test_id, sequence_order)'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS lessons_course_sequence_unique');
        DB::statement('DROP INDEX IF EXISTS test_questions_test_sequence_unique');
    }
};
