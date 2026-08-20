<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseAssignment extends Model
{
    protected $fillable = [
        'course_id',
        'lesson_id',
        'instructor_id',
        'assigned_by',
        'assigned_at',
        'unassigned_at',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'unassigned_at' => 'datetime',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }

    public function instructor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
