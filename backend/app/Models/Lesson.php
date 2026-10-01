<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lesson extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'course_id',
        'title',
        'description',
        'content',
        'sequence_order',
        'video_provider_id',
        'duration_seconds',
        'topic_id',
        'topic_position',
    ];

    protected function casts(): array
    {
        return [
            'sequence_order' => 'integer',
            'duration_seconds' => 'integer',
            'topic_id' => 'integer',
            'topic_position' => 'integer',
            'video_status_at' => 'datetime',
        ];
    }

    /**
     * Stan nagrania (`video_status`) opisuje konkretne nagranie. Gdy
     * identyfikator odtwarzany zmienia się zapisem lekcji (ręcznie, poza
     * ścieżką wgrania), a lekcja nie ma nagrania „w drodze”, dotychczasowy
     * stan przestaje być prawdą o nowym identyfikatorze: wraca do „nieznany”
     * i ustali go pierwszy odczyt stanu. Ścieżka wgrania i odczyt stanu
     * zapisują stan jawnie, więc ta reguła ich nie dotyczy.
     */
    protected static function booted(): void
    {
        static::saving(function (Lesson $lesson): void {
            if (
                $lesson->isDirty('video_provider_id')
                && ! $lesson->isDirty('video_status')
                && ! $lesson->isDirty('video_pending_id')
                && $lesson->video_pending_id === null
                && $lesson->video_status !== null
            ) {
                $lesson->video_status = null;
                $lesson->video_status_at = null;
            }
        });
    }

    /**
     * @return BelongsTo<Course, $this>
     */
    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * @return BelongsTo<CourseTopic, $this>
     */
    public function topic(): BelongsTo
    {
        return $this->belongsTo(CourseTopic::class, 'topic_id');
    }

    /**
     * @return HasMany<Material, $this>
     */
    public function materials(): HasMany
    {
        return $this->hasMany(Material::class);
    }

    /**
     * @return HasMany<LessonProgress, $this>
     */
    public function progress(): HasMany
    {
        return $this->hasMany(LessonProgress::class);
    }

    /**
     * @return HasMany<InstructorQuestion, $this>
     */
    public function questions(): HasMany
    {
        return $this->hasMany(InstructorQuestion::class);
    }

    /**
     * @return HasMany<CourseAssignment, $this>
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(CourseAssignment::class);
    }
}
