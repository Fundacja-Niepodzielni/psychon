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
        'sequence_order',
        'video_provider_id',
        'duration_seconds',
    ];

    protected function casts(): array
    {
        return [
            'sequence_order' => 'integer',
            'duration_seconds' => 'integer',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function materials(): HasMany
    {
        return $this->hasMany(Material::class);
    }

    public function progress(): HasMany
    {
        return $this->hasMany(LessonProgress::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(InstructorQuestion::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(CourseAssignment::class);
    }
}
