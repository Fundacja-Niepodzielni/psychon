<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stan nagrania lekcji w bazie oraz nagranie „w drodze”.
     *
     * Trzy kolumny, wszystkie puste dla lekcji zastanych — migracja NIE zmienia
     * danych i niczego nie wypełnia:
     *  - `video_status` — stan nagrania ze słownika zamkniętego
     *    `none · uploading · processing · ready · error`; pusta wartość przy
     *    lekcji z identyfikatorem znaczy „stan nieznany” (ustala go pierwszy
     *    odczyt stanu przez administrację), przy lekcji bez identyfikatora —
     *    brak nagrania;
     *  - `video_status_at` — chwila, w której stan został ustalony;
     *  - `video_pending_id` — identyfikator nagrania wysyłanego albo
     *    przetwarzanego; `video_provider_id` zostaje nagraniem odtwarzanym
     *    i zmienia się dopiero wtedy, gdy nowe nagranie jest gotowe.
     *
     * Identyfikator „w drodze” ma własny indeks częściowy niepowtarzalności,
     * liczony tak samo jak indeks identyfikatora odtwarzanego: tylko żywe
     * lekcje (`deleted_at IS NULL`), tylko niepusta wartość, bez rozróżniania
     * wielkości liter. Niepowtarzalności MIĘDZY kolumnami (ten sam identyfikator
     * odtwarzany w jednej lekcji i „w drodze” w innej) pilnuje kod zapisu.
     */
    public function up(): void
    {
        Schema::table('lessons', function (Blueprint $table) {
            $table->string('video_status', 16)->nullable();
            $table->timestamp('video_status_at')->nullable();
            $table->string('video_pending_id')->nullable();
        });

        DB::statement(
            'ALTER TABLE lessons ADD CONSTRAINT lessons_video_status_check
             CHECK (video_status IN (\'none\', \'uploading\', \'processing\', \'ready\', \'error\'))'
        );

        DB::statement(
            'CREATE UNIQUE INDEX lessons_video_pending_id_unique
             ON lessons (lower(video_pending_id))
             WHERE deleted_at IS NULL AND video_pending_id IS NOT NULL AND video_pending_id <> \'\''
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS lessons_video_pending_id_unique');
        DB::statement('ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_video_status_check');

        Schema::table('lessons', function (Blueprint $table) {
            $table->dropColumn(['video_status', 'video_status_at', 'video_pending_id']);
        });
    }
};
