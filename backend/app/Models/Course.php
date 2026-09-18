<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Course extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'title',
        'slug',
        'description',
        'type',
        'product_group',
        'sequence_order',
        'edition_id',
        'is_published',
    ];

    protected function casts(): array
    {
        return [
            'sequence_order' => 'integer',
            'is_published' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Edition, $this>
     */
    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }

    /**
     * @return HasMany<Lesson, $this>
     */
    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class)->orderBy('sequence_order');
    }

    /**
     * @return HasMany<Material, $this>
     */
    public function materials(): HasMany
    {
        return $this->hasMany(Material::class);
    }

    /**
     * @return HasOne<Test, $this>
     */
    public function test(): HasOne
    {
        return $this->hasOne(Test::class);
    }

    /**
     * @return HasMany<CourseAssignment, $this>
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(CourseAssignment::class);
    }
}
