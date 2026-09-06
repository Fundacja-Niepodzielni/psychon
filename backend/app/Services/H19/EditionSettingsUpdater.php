<?php

namespace App\Services\H19;

use App\Models\Edition;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Zapisuje ustawienia aktywnej edycji. `Settings::edition()` (sygnatura
 * zamrożona) jest tylko do odczytu — zapis idzie bezpośrednio przez model.
 */
final class EditionSettingsUpdater
{
    /**
     * @param  array<string, mixed>  $validated
     */
    public static function update(Edition $edition, array $validated, User $actor): Edition
    {
        return DB::transaction(function () use ($edition, $validated, $actor): Edition {
            $edition->update($validated);

            AuditLog::record($actor, 'edition.updated', $edition, [
                'changed' => array_keys($validated),
            ]);

            return $edition->fresh();
        });
    }
}
