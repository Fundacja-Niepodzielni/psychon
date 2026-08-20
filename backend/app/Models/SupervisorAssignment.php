<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupervisorAssignment extends Model
{
    protected $fillable = [
        'volunteer_id',
        'supervisor_id',
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

    public function volunteer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'volunteer_id');
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }
}
