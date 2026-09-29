<?php

use App\Models\CourseTopic;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Warstwa tematów kursu: kurs → tematy → lekcje. Migracja tylko DODAJE —
     * nową tabelę `course_topics` i dwie kolumny w `lessons`, obie nullable.
     *
     * `lessons.sequence_order` zostaje bez zmian i nadal jest globalną,
     * spłaszczoną kolejnością lekcji w kursie (najpierw pozycja tematu, potem
     * `topic_position`). Dzięki temu `Course::lessons()` i każdy czytelnik
     * płaskiej listy działają jak dotąd. `lesson_progress` wiąże się wyłącznie
     * przez `lesson_id`, więc postęp nie zależy od tematów.
     *
     * Uzupełnienie danych idzie surowym SQL, bez modeli: każdy kurs mający
     * choć jeden wiersz lekcji dostaje jeden temat domyślny, wszystkie jego
     * lekcje trafiają do tego tematu, a żywa lekcja dostaje `topic_position`
     * równe swojej randze po `sequence_order, id`. Lekcja usunięta miękko
     * zostaje przy temacie, ale bez pozycji — nie zajmuje miejsca w unikacie.
     *
     * Tytuł tematu domyślnego pochodzi z jednej stałej zaplecza
     * (`CourseTopic::DEFAULT_TITLE`); ten sam tytuł nadaje serwis, gdy temat
     * domyślny powstaje przy pierwszej lekcji kursu.
     */
    public function up(): void
    {
        Schema::create('course_topics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->unsignedSmallInteger('position');
            $table->timestamps();
            $table->softDeletes();
        });

        DB::statement(
            'CREATE UNIQUE INDEX course_topics_course_position_unique
             ON course_topics (course_id, position)
             WHERE deleted_at IS NULL'
        );

        Schema::table('lessons', function (Blueprint $table) {
            $table->foreignId('topic_id')->nullable()->constrained('course_topics')->nullOnDelete();
            $table->unsignedSmallInteger('topic_position')->nullable();
            $table->index('topic_id');
        });

        DB::statement(
            'CREATE UNIQUE INDEX lessons_topic_position_unique
             ON lessons (topic_id, topic_position)
             WHERE deleted_at IS NULL'
        );

        DB::statement(
            'INSERT INTO course_topics (course_id, title, position, created_at, updated_at)
             SELECT course_id, CAST(? AS varchar(255)), 1, NOW(), NOW()
             FROM lessons
             GROUP BY course_id',
            [CourseTopic::DEFAULT_TITLE],
        );

        DB::statement(
            'UPDATE lessons SET topic_id = course_topics.id
             FROM course_topics
             WHERE course_topics.course_id = lessons.course_id'
        );

        DB::statement(
            'UPDATE lessons SET topic_position = ranked.lesson_rank
             FROM (
                 SELECT id, ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY sequence_order, id) AS lesson_rank
                 FROM lessons
                 WHERE deleted_at IS NULL
             ) AS ranked
             WHERE ranked.id = lessons.id'
        );
    }

    /**
     * Zdejmuje wyłącznie to, co dodało `up()`: unikat, obie kolumny lekcji
     * i tabelę tematów. Wiersze lekcji i postępu zostają nietknięte.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS lessons_topic_position_unique');

        Schema::table('lessons', function (Blueprint $table) {
            $table->dropConstrainedForeignId('topic_id');
            $table->dropColumn('topic_position');
        });

        Schema::drop('course_topics');
    }
};
