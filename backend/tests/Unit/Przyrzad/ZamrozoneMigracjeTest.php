<?php

namespace Tests\Unit\Przyrzad;

use PHPUnit\Framework\TestCase;

/**
 * Świadek TREŚCI migracji zamrożonych.
 *
 * KRYTERIUM. Zbiór migracji zastanych jest zamrożony dla wszystkich ról: strażnik
 * zakresów wylicza go z pomiaru wobec SHA bazy i odmawia commita, który dotyka
 * którejkolwiek z nich. Strażnik pilnuje jednak ŚCIEŻKI, a nie TREŚCI — a ścieżki
 * nikt nie musi zmieniać, żeby zmienić migrację: plik edytowany w miejscu zachowuje
 * nazwę i znacznik czasu, więc zamrożenie nie ma czego zauważyć. `--no-verify` omija
 * przy tym każdy hak. Ta dziura jest tu domykana pomiarem sumy kontrolnej.
 *
 * CO DOKŁADNIE MIERZY: dla każdego pliku, który istniał w SHA bazy pod
 * `backend/database/migrations/`, porównuje sumę blob gita z pomiaru w bazie
 * (`tests/Przyrzad/migracje-zamrozone.sums`) z sumą blob policzoną TERAZ z bajtów
 * pliku w drzewie roboczym. Różnica choćby jednego bajtu zmienia sumę i test staje
 * na czerwono, nazywając plik oraz obie sumy.
 *
 * CZEGO NIE MIERZY, i mówię to wprost:
 *   * nie czyta gita — bramka biegnie w kontenerze, gdzie zamontowany jest wyłącznie
 *     `./backend`; nie ma tam ani katalogu `.git`, ani programu `git` (zmierzone:
 *     `git: not found`). Sumy przyjeżdżają więc plikiem wygenerowanym z gita na hoście;
 *     nagłówek pliku podaje SHA bazy i polecenie odtwarzające go co do bajtu;
 *   * nie broni się sam przed podmianą sum RAZEM z migracją — jedna zmiana w dwóch
 *     plikach naraz przechodzi tutaj. Tę warstwę mierzy strona hosta (ma historię),
 *     a nie ten test. Plik sum nie jest dowodem na samego siebie;
 *   * nie ocenia migracji NOWYCH — te nie były zamrożone i idą zwykłą ścieżką.
 *
 * Bez bazy i bez aplikacji, więc świadomie NIE należy do grupy `wspolna-baza`:
 * nie ma czego dzielić z sąsiadem, biegnie w kroku równoległym.
 *
 * `php artisan test --filter=ZamrozoneMigracje`
 */
final class ZamrozoneMigracjeTest extends TestCase
{
    private const MANIFEST = __DIR__.'/../../Przyrzad/migracje-zamrozone.sums';

    public function test_zamrozona_migracja_ma_tresc_z_sha_bazy(): void
    {
        [$baza, $sumy] = $this->manifest();

        $rozjazdy = [];

        foreach ($sumy as $sciezkaWRepo => $sumaZBazy) {
            $plik = $this->plikWDrzewie($sciezkaWRepo);

            if (! is_file($plik)) {
                $rozjazdy[] = sprintf(
                    '%s: migracja zamrożona ZNIKNĘŁA z drzewa roboczego (w bazie %s suma %s)',
                    $sciezkaWRepo,
                    $baza,
                    $sumaZBazy,
                );

                continue;
            }

            $zmierzona = $this->sumaBlob((string) file_get_contents($plik));

            if ($zmierzona !== $sumaZBazy) {
                $rozjazdy[] = sprintf(
                    "%s\n      w bazie %s: %s\n      w drzewie:    %s",
                    $sciezkaWRepo,
                    $baza,
                    $sumaZBazy,
                    $zmierzona,
                );
            }
        }

        $this->assertSame(
            [],
            $rozjazdy,
            'Migracja ZAMROŻONA ma dziś inną treść niż w SHA bazy. Zamrożenie znaczy, że '
            ."stanu zastanego nie poprawiamy w miejscu — zmiana schematu idzie NOWĄ migracją:\n  "
            .implode("\n  ", $rozjazdy),
        );
    }

    public function test_manifest_sum_nie_jest_pusty(): void
    {
        // Kontrola pozytywna do powyższego: pusty albo nieczytelny manifest dałby
        // pętlę po zbiorze pustym, czyli test zielony, który niczego nie zmierzył.
        [$baza, $sumy] = $this->manifest();

        $this->assertMatchesRegularExpression(
            '/^[0-9a-f]{7,40}$/',
            $baza,
            'Nagłówek `BAZA:` manifestu nie wygląda na SHA — nie wiadomo, wobec czego liczone są sumy.',
        );

        $this->assertNotSame([], $sumy, 'Manifest sum migracji zamrożonych jest pusty — nie ma czego mierzyć.');

        foreach ($sumy as $sciezka => $suma) {
            $this->assertMatchesRegularExpression('/^[0-9a-f]{40}$/', $suma, 'Zła suma dla '.$sciezka);
            $this->assertStringStartsWith(
                'backend/database/migrations/',
                $sciezka,
                'Manifest wymienia plik spoza zbioru migracji: '.$sciezka,
            );
        }
    }

    /**
     * Suma blob gita liczona z BAJTÓW pliku: `sha1("blob <długość>\0<treść>")`.
     *
     * To ta sama liczba, którą wypisuje `git hash-object`, więc manifest da się
     * odtworzyć i sprawdzić po stronie hosta bez tego testu — i odwrotnie.
     */
    private function sumaBlob(string $tresc): string
    {
        return sha1('blob '.strlen($tresc)."\0".$tresc);
    }

    /**
     * Ścieżki w manifeście są względem KORZENIA repo (tak je widzi git), a testy
     * biegną z `backend/` jako katalogiem bazowym — przeliczenie jest tu jawne,
     * zamiast przepisywać manifest na inną postać niż ta, którą zmierzył git.
     */
    private function plikWDrzewie(string $sciezkaWRepo): string
    {
        return dirname(__DIR__, 3).'/'.substr($sciezkaWRepo, strlen('backend/'));
    }

    /** @return array{0: string, 1: array<string, string>} */
    private function manifest(): array
    {
        $sciezka = self::MANIFEST;

        $this->assertFileExists($sciezka, 'Brak manifestu sum migracji zamrożonych — nie ma czym mierzyć.');

        $baza = '';
        $sumy = [];

        foreach (file($sciezka, FILE_IGNORE_NEW_LINES) as $wiersz) {
            if ($wiersz === '' || str_starts_with($wiersz, '#')) {
                continue;
            }

            if (str_starts_with($wiersz, 'BAZA:')) {
                $baza = trim(substr($wiersz, strlen('BAZA:')));

                continue;
            }

            $czesci = preg_split('/\s+/', trim($wiersz), 2);

            if ($czesci === false || count($czesci) !== 2) {
                $this->fail('Wiersz manifestu nie ma postaci `<suma>  <ścieżka>`: '.$wiersz);
            }

            $sumy[$czesci[1]] = $czesci[0];
        }

        return [$baza, $sumy];
    }
}
