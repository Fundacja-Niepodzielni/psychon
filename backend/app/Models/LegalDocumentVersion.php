<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Pakiet H22 · Dokumenty prawne z wersjami. Rodzaje zamknięte w `TYPES` —
 * nowy rodzaj to zmiana kodu, nie danych. Wersja opublikowana jest
 * niezmienna (kontroler odmawia edycji/usunięcia); zmiana treści zawsze
 * zakłada nową wersję. Dokładnie jedna wersja bieżąca na rodzaj — najnowsza
 * opublikowana (po `published_at`).
 *
 * Rzutowanie przez `$casts` (nie metodę `casts()`) celowo — projekt ma
 * `parseModelCastsMethod: false` (phpstan.neon), więc metodowa forma nie
 * jest widoczna dla analizy statycznej (patrz baseline: `DataExportResource`
 * i inne mają przez to zamrożone błędy „Cannot call method … on string”
 * na polach dat rzutowanych metodą `casts()`).
 */
class LegalDocumentVersion extends Model
{
    public const array TYPES = ['regulamin', 'polityka', 'klauzula-rodo'];

    public const string STATUS_DRAFT = 'draft';

    public const string STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'type',
        'version',
        'content',
        'status',
        'published_at',
    ];

    protected $casts = [
        'published_at' => 'datetime',
    ];

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }

    /**
     * Najnowsza opublikowana wersja danego rodzaju, albo `null`, gdy żadna
     * nie została jeszcze opublikowana.
     */
    public static function current(string $type): ?self
    {
        return static::query()
            ->ofType($type)
            ->published()
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->first();
    }

    /**
     * Mapa rodzaj → oznaczenie wersji bieżącej, dla rodzajów, które mają
     * choć jedną wersję opublikowaną. Jedno zapytanie — używane przy
     * wyliczaniu, których rodzajów brakuje w `consents` (H01 `/me`).
     *
     * @return array<string, string>
     */
    public static function currentVersionsByType(): array
    {
        $map = [];

        foreach (self::TYPES as $type) {
            $current = static::current($type);
            if ($current !== null) {
                $map[$type] = $current->version;
            }
        }

        return $map;
    }
}
