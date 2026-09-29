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
