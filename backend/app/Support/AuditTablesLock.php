<?php

namespace App\Support;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Jedyne miejsce, które otwiera blokadę dzienników (`audit_log`,
 * `sensitive_access_log`) założoną migracją `2026_10_01_140000_lock_audit_tables`.
 *
 * Otwarcie dotyczy wyłącznie usunięcia i opróżnienia, i wyłącznie transakcji,
 * w której zostało wywołane: wartością przełącznika jest identyfikator bieżącej
 * transakcji, więc po jej zakończeniu (zatwierdzeniu albo wycofaniu) blokada
 * wraca sama — nie ma czego „włączyć z powrotem" i nie ma czego zapomnieć.
 * Zmiany wiersza (UPDATE) przełącznik nie otwiera nigdy.
 *
 * Nazwa przełącznika występuje w dokładnie dwóch plikach: w migracji i tutaj.
 * Pilnuje tego `Tests\Unit\Przyrzad\AuditTablesLockGuardTest`, razem z listą
 * miejsc, którym wolno wołać tę klasę.
 */
final class AuditTablesLock
{
    public const string SWITCH = 'psychon.audit_tables_purge';

    /**
     * Pozwala usuwać i opróżniać dzienniki do końca bieżącej transakcji.
     *
     * Poza transakcją odmawia: ustawienie lokalne bez transakcji znika razem
     * z poleceniem, które je ustawiło, więc wywołanie niczego by nie otworzyło,
     * a wyglądałoby, jakby otworzyło.
     */
    public static function allowPurgeInCurrentTransaction(?ConnectionInterface $connection = null): void
    {
        $connection ??= DB::connection();

        if ($connection->transactionLevel() === 0) {
            throw new LogicException(
                'Blokadę dzienników można otworzyć wyłącznie wewnątrz transakcji.'
            );
        }

        $connection->select(
            'select set_config(?, pg_current_xact_id()::text, true)',
            [self::SWITCH],
        );
    }
}
