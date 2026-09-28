<?php

/**
 * Świadek dwustronny trasa<->dokument OpenAPI.
 *
 * Noga 1 (trasa -> dokument): każda trasa z routera (metoda + ścieżka) ma
 * odpowiadającą operację (metoda + path) w openapi.json.
 * Noga 2 (dokument -> trasa): każda operacja w openapi.json wskazuje istniejącą
 * trasę.
 *
 * Wejście: dwa pliki JSON.
 *   1) wynik `php artisan route:list --path=api --json`
 *   2) wygenerowany `openapi.json` (Scramble)
 *
 * Wyjście: liczby (mianowniki), listy rozjazdów obu nóg, kod wyjścia.
 * Kod wyjścia: 0 = zero rozjazdów w obu nogach; 3 = co najmniej jeden rozjazd.
 *
 * Metoda GET|HEAD z routera liczy się jako jedna operacja GET (HEAD jest
 * niesamodzielny — pochodna GET, nie osobna operacja w OpenAPI/Scramble).
 * Ścieżka routera ma przedrostek "api/", dokument go nie niesie (Scramble
 * ucina jeden statyczny "include" z konfiguracji `api_path`) — normalizacja
 * zdejmuje ten przedrostek przed porównaniem, nic więcej nie zmienia.
 */
function normalizujSciezke(string $uri): string
{
    $uri = '/'.ltrim($uri, '/');
    $uri = preg_replace('#^/api#', '', $uri);
    // Klucz wiazania modelu w segmencie parametru (np. "{document:public_id}")
    // jest szczegolem routera, nie ksztaltem HTTP - Scramble emituje sam
    // "{document}". Zdejmujemy go, zeby porownanie nie mylilo tego z realnym
    // rozjazdem (zmierzone: H14 GET /documents/{document:public_id}/download).
    $uri = preg_replace('#\{([^:}]+):[^}]+\}#', '{$1}', $uri);

    return $uri === '' ? '/' : $uri;
}

/**
 * Tylko trasy pakietow (backend/routes/api/*.php), wszystkie zyja pod
 * Route::prefix('v1') w routes/api.php. Odsiewa infrastrukture pakietu
 * dokumentacji Scramble (GET /docs/api, GET /docs/api.json), ktora dopisuje
 * wlasny provider poza v1 i ktora nie jest trasa zadnego pakietu H01-H22.
 */
function naszaSciezka(string $sciezkaZnormalizowana): bool
{
    return str_starts_with($sciezkaZnormalizowana, '/v1');
}

/** @return array<string,true> klucz = "METODA sciezka" */
function zbiorZTras(array $trasy): array
{
    $zbior = [];
    foreach ($trasy as $trasa) {
        $metody = explode('|', (string) $trasa['method']);
        $sciezka = normalizujSciezke((string) $trasa['uri']);
        if (! naszaSciezka($sciezka)) {
            continue;
        }
        foreach ($metody as $metoda) {
            if ($metoda === 'HEAD') {
                continue; // pochodna GET, nie osobna operacja
            }
            $zbior[$metoda.' '.$sciezka] = true;
        }
    }

    return $zbior;
}

/** @return array<string,true> klucz = "METODA sciezka" */
function zbiorZDokumentu(array $dokument): array
{
    $dozwolone = ['get', 'post', 'put', 'patch', 'delete', 'options'];
    $zbior = [];
    foreach ($dokument['paths'] ?? [] as $sciezka => $operacje) {
        if (! naszaSciezka($sciezka)) {
            continue;
        }
        foreach ($operacje as $metoda => $tresc) {
            if (! in_array(strtolower((string) $metoda), $dozwolone, true)) {
                continue;
            }
            $zbior[strtoupper((string) $metoda).' '.$sciezka] = true;
        }
    }

    return $zbior;
}

function main(array $argv): int
{
    if (count($argv) < 3) {
        fwrite(STDERR, "uzycie: php openapi-swiadek.php <route-list.json> <openapi.json> [--usun-trase 'METODA /sciezka']\n");

        return 2;
    }

    [, $plikTras, $plikDokumentu] = $argv;
    $usunTrase = null;
    foreach ($argv as $i => $arg) {
        if ($arg === '--usun-trase' && isset($argv[$i + 1])) {
            $usunTrase = $argv[$i + 1];
        }
    }

    if (! is_file($plikTras)) {
        fwrite(STDERR, "ODMOWA: brak pliku tras: {$plikTras}\n");

        return 2;
    }
    if (! is_file($plikDokumentu)) {
        fwrite(STDERR, "ODMOWA: brak pliku dokumentu: {$plikDokumentu}\n");

        return 2;
    }

    $trasyRaw = json_decode((string) file_get_contents($plikTras), true);
    $dokument = json_decode((string) file_get_contents($plikDokumentu), true);

    if (! is_array($trasyRaw)) {
        fwrite(STDERR, "ODMOWA: {$plikTras} nie jest poprawnym JSON-em listy tras.\n");

        return 2;
    }
    if (! is_array($dokument)) {
        fwrite(STDERR, "ODMOWA: {$plikDokumentu} nie jest poprawnym JSON-em dokumentu.\n");

        return 2;
    }

    $zTras = zbiorZTras($trasyRaw);
    $zDokumentu = zbiorZDokumentu($dokument);

    if ($usunTrase !== null) {
        // KONTROLA DODATNIA: usuwamy jedną trasę z porównania, żeby
        // udowodnić, że świadek naprawdę zapala się na braku, a nie milczy.
        if (! isset($zTras[$usunTrase])) {
            fwrite(STDERR, "ODMOWA kontroli dodatniej: trasa '{$usunTrase}' nie istnieje w zbiorze - nie ma czego usuwac.\n");

            return 2;
        }
        unset($zTras[$usunTrase]);
    }

    $brakujaceWDokumencie = array_keys(array_diff_key($zTras, $zDokumentu));
    $martweWDokumencie = array_keys(array_diff_key($zDokumentu, $zTras));

    sort($brakujaceWDokumencie);
    sort($martweWDokumencie);

    echo 'mianownik tras (z routera, GET|HEAD liczone jako jedna operacja GET): '.count($zTras)."\n";
    echo 'mianownik operacji (z dokumentu openapi.json): '.count($zDokumentu)."\n";

    echo "\nNOGA 1 (trasa -> dokument), brakujace w dokumencie: ".count($brakujaceWDokumencie)."\n";
    foreach ($brakujaceWDokumencie as $wpis) {
        echo "  - {$wpis}\n";
    }

    echo "\nNOGA 2 (dokument -> trasa), martwe wpisy w dokumencie (bez istniejacej trasy): ".count($martweWDokumencie)."\n";
    foreach ($martweWDokumencie as $wpis) {
        echo "  - {$wpis}\n";
    }

    $kod = (count($brakujaceWDokumencie) === 0 && count($martweWDokumencie) === 0) ? 0 : 3;
    echo "\nWYNIK={$kod}\n";

    return $kod;
}

exit(main($argv));
