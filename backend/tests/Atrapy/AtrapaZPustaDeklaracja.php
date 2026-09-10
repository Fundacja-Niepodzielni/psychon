<?php

namespace Tests\Atrapy;

/**
 * Atrapa, której deklaracja bazy jest PUSTA — czyli przypadek Z-6a: „nikt nie napisał,
 * na czym mamy biec". Deklaracja jest podstawiana przez nadpisanie metody, a nie zmienną
 * środowiskową: środowisko jest tym, co cicho podmienia bazę, na której faktycznie stoi
 * połączenie, więc furtka sterowana środowiskiem otwierałaby tę samą lukę od kuchni.
 *
 * Plik z pustą deklaracją leży w `tests/Atrapy/phpunit-pusta-deklaracja.xml` i NIE jest
 * konfiguracją żadnego przebiegu — jest wzorcem wejściowym dla świadka.
 */
final class AtrapaZPustaDeklaracja extends StrazniczaAtrapa
{
    protected static function sciezkaDeklaracji(): string
    {
        return __DIR__.DIRECTORY_SEPARATOR.'phpunit-pusta-deklaracja.xml';
    }
}
