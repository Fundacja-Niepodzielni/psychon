<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Edytor wzorow dokumentow (zaplecze): biezacy wzor tresci na rodzaj
 * dokumentu. Generator (`App\Support\PdfService` przez
 * `App\Services\DocumentTemplates\DocumentTemplateRenderer`) siega po ten
 * wiersz zamiast po plik Blade, gdy wpis dla danego rodzaju istnieje.
 * Kazdy zapis (PUT) podbija `version` o 1 i dopisuje wiersz do
 * `versions()` - historia jest tylko dopisywana, nigdy edytowana.
 *
 * @property int $id
 * @property string $type
 * @property string $content
 * @property int $version
 * @property int|null $updated_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $updatedBy
 * @property-read Collection<int, DocumentTemplateVersion> $versions
 */
class DocumentTemplate extends Model
{
    /**
     * Rodzaje zamkniete: nowy rodzaj to zmiana kodu (migracja + seed), nie
     * danych - kontrolery odmawiaja (404) kazdego rodzaju spoza tej listy.
     *
     * @var list<string>
     */
    public const array TYPES = ['agreement', 'attendance_certificate', 'certificate'];

    protected $fillable = [
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
     * @return BelongsTo<User, $this>
     */
    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * @return HasMany<DocumentTemplateVersion, $this>
     */
    public function versions(): HasMany
    {
        return $this->hasMany(DocumentTemplateVersion::class);
    }
}
