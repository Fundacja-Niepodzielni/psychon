<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Temat kursu — warstwa między kursem a lekcjami. Kolejność tematów w kursie
 * (`position`) i lekcji w temacie (`lessons.topic_position`) nadaje wyłącznie
 * serwer (`App\Services\H08\TopicWriter`).
 */
class CourseTopic extends Model
{
    use SoftDeletes;

    /**
     * Tytuł tematu domyślnego — jedyne źródło tej wartości w zapleczu. Czyta
     * go migracja uzupełniająca istniejące kursy i serwis, który zakłada temat
     * przy pierwszej lekcji kursu bez tematów.
     */
    public const string DEFAULT_TITLE = 'Lekcje kursu';

    protected $fillable = [
        'course_id',
        'title',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'course_id' => 'integer',
            'position' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Course, $this>
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * @return HasMany<Lesson, $this>
     */
    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class, 'topic_id')
            ->orderBy('topic_position')
            ->orderBy('id');
    }
}
