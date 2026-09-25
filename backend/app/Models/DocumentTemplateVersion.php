<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Edytor wzorow dokumentow (zaplecze): jeden wiersz na kazdy zapis wzoru -
 * append-only, kontrolery nigdy nie edytuja ani nie usuwaja wiersza stad.
 *
 * @property int $id
 * @property int $document_template_id
 * @property string $type
 * @property string $content
 * @property int $version
 * @property int|null $updated_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read DocumentTemplate $documentTemplate
 * @property-read User|null $updatedBy
 */
class DocumentTemplateVersion extends Model
{
    protected $fillable = [
        'document_template_id',
        'type',
        'content',
        'version',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<DocumentTemplate, $this>
     */
    public function documentTemplate(): BelongsTo
    {
        return $this->belongsTo(DocumentTemplate::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
