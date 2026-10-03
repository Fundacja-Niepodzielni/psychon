<?php

namespace App\Services\Cutover;

use RuntimeException;

/**
 * Odmowa biegu przejscia test -> produkcja z nazwana przyczyna. Komunikat nie
 * niesie wartosci pol osob ani tresci pliku listy kont - tylko numer pozycji
 * albo wiersza i liczby.
 */
final class PurgeRefused extends RuntimeException {}
