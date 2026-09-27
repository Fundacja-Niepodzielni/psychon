<?php

/**
 * Patrz main() nizej - jedyne miejsce w tym pliku, gdzie wartosc z argv
 * trafia do konstrukcji wzorca. Te dwie stale sa jedynymi miejscami, w
 * ktorych ten plik swiadomie wybiera kod niezerowy.
 *
 * Zaokraglenie zgodne do 3 miejsc po przecinku.
 *
 * Wszystkie wystapienia flagi `--nadpisz=wartosc` moga wystapic wiele
 * razy w jednym wywolaniu (bez wskazania, gdzie w drzewie one zyja).
 */
final class Czysty
{
    public static function main(): bool
    {
        return true;
    }
}
