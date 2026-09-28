<?php

namespace Tests\Unit\H20;

use App\Http\Requests\H20\AuditIndexRequest;
use FilesystemIterator;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Przyrząd źródłowy: każdy slug użyty w wywołaniu `AuditLog::record(...)` w kodzie
 * produkcyjnym (`backend/app/**​/*.php`) musi być wymieniony w
 * `AuditIndexRequest::ACTIONS` — inaczej zdarzenie zapisuje się w dzienniku, ale nie
 * da się go odfiltrować ani wyeksportować przez `GET /admin/audit?action=...`
 * (kontrakt §3.2 jest jedynym źródłem prawdy o rejestrze audytu).
 *
 * Drugi argument nie musi być literałem stringowym wprost w wywołaniu: forma
 * `self::NAZWA`, `static::NAZWA` albo `Klasa::NAZWA` jest ROZWIĄZYWANA do literału
 * ze znalezionej definicji stałej (`const ... NAZWA = '...';`, w tym samym pliku dla
 * `self`/`static`, albo w pliku deklarującym wskazaną klasę). Rozwiązanie, którego nie
 * da się dokończyć — stała nieznaleziona, klasa nieznaleziona, wyrażenie inne niż
 * literał albo odwołanie do stałej — jest naruszeniem WPROST: test nie pomija go po
 * cichu, wypisuje plik:wiersz i czerwienieje.
 *
 * Bez bazy i bez aplikacji Laravel — czysty skan plików, dlatego zwykły
 * `PHPUnit\Framework\TestCase`.
 *
 * STAŁA WYJĄTKÓW — PUSTA JAKO KONTROLA DODATNIA: dwa slugi pakietu H01
 * (`cooperation_request.created`, `cooperation_request.answered`) stały tu tymczasowo
 * jako WIADOMA luka w oczekiwaniu na strażnika kontraktu, który już rozstrzygnął, że
 * oba slugi wchodzą wprost do `AuditIndexRequest::ACTIONS`. Stała zostaje w kodzie —
 * ale PUSTA — i ma zostać pusta: to sama w sobie kontrola dodatnia (denominator
 * poniżej drukuje jej licznik jako 0). Test jest wobec niej nadal DWUSTRONNY, na
 * wypadek gdyby w przyszłości znów pojawił się slug poza rejestrem:
 *   - slug spoza `ACTIONS` i spoza tej stałej            → naruszenie (nowa, nieznana luka);
 *   - slug z tej stałej, który jest JUŻ w `ACTIONS`,
 *     albo już nigdzie nie jest zapisywany (nieaktualny) → naruszenie (stała nieświeża).
 * Nieme pominięcie żadnej z tych dwóch stron nie jest dozwolone.
 */
final class AuditLogSlugRegistryTest extends TestCase
{
    private const string NEEDLE = 'AuditLog::record';

    /**
     * Oba dawne wyjątki są już w `ACTIONS`. Stała zostaje pusta celowo
     * (kontrola dodatnia) — patrz komentarz klasy.
     */
    private const array KNOWN_OUTSIDE_REGISTRY = [
    ];

    public function test_every_audit_log_record_slug_is_registered_in_actions(): void
    {
        $root = dirname(__DIR__, 3).'/app';
        self::assertDirectoryExists($root, 'Korzeń app/ nie istnieje — nie ma czego skanować.');

        $files = $this->phpFiles($root);
        self::assertNotEmpty($files, 'Skan nie znalazł ani jednego pliku .php — przyrząd nic by nie mierzył.');

        $violations = [];
        $callCount = 0;
        $literalCount = 0;
        $constantResolvedCount = 0;
        $unresolvedCount = 0;
        $uniqueSlugs = [];
        $classContentsCache = [];

        foreach ($files as $file) {
            $contents = file_get_contents($file);

            if ($contents === false || ! str_contains($contents, self::NEEDLE)) {
                continue;
            }

            $relative = 'backend/app'.substr($file, strlen($root));

            foreach ($this->findCalls($contents) as [$argsText, $line]) {
                $callCount++;
                $location = sprintf('%s:%d', $relative, $line);

                $secondArgument = $this->secondArgument($argsText);

                if ($secondArgument === null) {
                    $unresolvedCount++;
                    $violations[] = sprintf(
                        '%s — nie udało się wydzielić drugiego argumentu wywołania AuditLog::record(...)',
                        $location,
                    );

                    continue;
                }

                [$resolvedSlug, $kind] = $this->resolveSlug($secondArgument, $contents, $files, $classContentsCache);

                if ($kind === 'literal') {
                    $literalCount++;
                } elseif ($kind === 'constant') {
                    $constantResolvedCount++;
                } else {
                    $unresolvedCount++;
                    $violations[] = sprintf(
                        '%s — slug nie jest literałem stringowym ani rozwiązywalnym odwołaniem do stałej: `%s`',
                        $location,
                        trim($secondArgument),
                    );

                    continue;
                }

                $uniqueSlugs[$resolvedSlug] = true;

                $inActions = in_array($resolvedSlug, AuditIndexRequest::ACTIONS, true);
                $isKnownException = in_array($resolvedSlug, self::KNOWN_OUTSIDE_REGISTRY, true);

                if (! $inActions && ! $isKnownException) {
                    $violations[] = sprintf(
                        '%s — slug "%s" spoza AuditIndexRequest::ACTIONS i spoza KNOWN_OUTSIDE_REGISTRY',
                        $location,
                        $resolvedSlug,
                    );
                } elseif ($inActions && $isKnownException) {
                    $violations[] = sprintf(
                        '%s — slug "%s" jest już w AuditIndexRequest::ACTIONS, a KNOWN_OUTSIDE_REGISTRY'
                        .' wciąż go wymienia jako lukę — stała nieświeża, wykreśl go stamtąd',
                        $location,
                        $resolvedSlug,
                    );
                }
            }
        }

        // Druga strona: każdy wpis KNOWN_OUTSIDE_REGISTRY musi nadal być emitowany W KODZIE
        // (inaczej stała nieświeża) i nadal NIE być w ACTIONS (inaczej powinien z niej zniknąć).
        foreach (self::KNOWN_OUTSIDE_REGISTRY as $knownSlug) {
            if (! array_key_exists($knownSlug, $uniqueSlugs)) {
                $violations[] = sprintf(
                    'KNOWN_OUTSIDE_REGISTRY — slug "%s" nie jest już nigdzie emitowany przez'
                    .' AuditLog::record — stała nieświeża, usuń go z niej',
                    $knownSlug,
                );
            } elseif (in_array($knownSlug, AuditIndexRequest::ACTIONS, true)) {
                $violations[] = sprintf(
                    'KNOWN_OUTSIDE_REGISTRY — slug "%s" jest już w AuditIndexRequest::ACTIONS —'
                    .' stała nieświeża, usuń go z niej',
                    $knownSlug,
                );
            }
        }

        $denominator = sprintf(
            'wywołań AuditLog::record: %d, literałów: %d, stałych rozwiązanych: %d, '
            .'nierozwiązanych: %d, różnych slugów: %d, znanych wyjątków spoza rejestru: %d',
            $callCount,
            $literalCount,
            $constantResolvedCount,
            $unresolvedCount,
            count($uniqueSlugs),
            count(self::KNOWN_OUTSIDE_REGISTRY),
        );

        // Mianownik trafia do wyjścia testu niezależnie od wyniku (czerwonego i zielonego).
        fwrite(STDERR, '[audit-slug-registry] '.$denominator.PHP_EOL);

        self::assertGreaterThan(
            0,
            $callCount,
            'Zero wywołań AuditLog::record w backend/app — przyrząd nic by nie mierzył. '.$denominator,
        );

        self::assertSame(
            [],
            $violations,
            $denominator."\n".implode("\n", $violations),
        );
    }

    /** @return list<string> */
    private function phpFiles(string $root): array
    {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        );

        $files = [];

        foreach ($iterator as $fileInfo) {
            if ($fileInfo->isFile() && $fileInfo->getExtension() === 'php') {
                $files[] = $fileInfo->getPathname();
            }
        }

        sort($files);

        return $files;
    }

    /**
     * Zwraca listę [tekstArgumentów, numerLinii] dla każdego wywołania
     * `AuditLog::record(` w treści pliku, z poprawnym dopasowaniem nawiasu
     * zamykającego (licznik głębokości, z pominięciem nawiasów i przecinków
     * wewnątrz literałów stringowych).
     *
     * @return list<array{0: string, 1: int}>
     */
    private function findCalls(string $contents): array
    {
        $calls = [];
        $searchFrom = 0;

        while (($pos = strpos($contents, self::NEEDLE, $searchFrom)) !== false) {
            $searchFrom = $pos + 1;
            $parenPos = strpos($contents, '(', $pos);

            if ($parenPos === false) {
                continue;
            }

            $between = substr($contents, $pos + strlen(self::NEEDLE), $parenPos - ($pos + strlen(self::NEEDLE)));
            if (trim($between) !== '') {
                // Coś stoi pomiędzy `record` a `(` — to nie jest to wywołanie.
                continue;
            }

            $end = $this->matchParen($contents, $parenPos);

            if ($end === null) {
                continue;
            }

            $argsText = substr($contents, $parenPos + 1, $end - $parenPos - 1);
            $line = substr_count($contents, "\n", 0, $pos) + 1;
            $calls[] = [$argsText, $line];
            $searchFrom = $end + 1;
        }

        return $calls;
    }

    private function matchParen(string $contents, int $openPos): ?int
    {
        $depth = 0;
        $len = strlen($contents);
        $inString = null;

        for ($i = $openPos; $i < $len; $i++) {
            $ch = $contents[$i];

            if ($inString !== null) {
                if ($ch === '\\') {
                    $i++;

                    continue;
                }
                if ($ch === $inString) {
                    $inString = null;
                }

                continue;
            }

            if ($ch === "'" || $ch === '"') {
                $inString = $ch;

                continue;
            }

            if ($ch === '(') {
                $depth++;
            } elseif ($ch === ')') {
                $depth--;
                if ($depth === 0) {
                    return $i;
                }
            }
        }

        return null;
    }

    private function secondArgument(string $argsText): ?string
    {
        $parts = $this->splitTopLevel($argsText);

        return $parts[1] ?? null;
    }

    /** @return list<string> */
    private function splitTopLevel(string $text): array
    {
        $parts = [];
        $depth = 0;
        $inString = null;
        $current = '';
        $len = strlen($text);

        for ($i = 0; $i < $len; $i++) {
            $ch = $text[$i];

            if ($inString !== null) {
                $current .= $ch;
                if ($ch === '\\') {
                    $i++;
                    if ($i < $len) {
                        $current .= $text[$i];
                    }

                    continue;
                }
                if ($ch === $inString) {
                    $inString = null;
                }

                continue;
            }

            if ($ch === "'" || $ch === '"') {
                $inString = $ch;
                $current .= $ch;

                continue;
            }

            if ($ch === '(' || $ch === '[' || $ch === '{') {
                $depth++;
                $current .= $ch;

                continue;
            }

            if ($ch === ')' || $ch === ']' || $ch === '}') {
                $depth--;
                $current .= $ch;

                continue;
            }

            if ($ch === ',' && $depth === 0) {
                $parts[] = $current;
                $current = '';

                continue;
            }

            $current .= $ch;
        }

        if (trim($current) !== '') {
            $parts[] = $current;
        }

        return array_map('trim', $parts);
    }

    private function literalString(string $arg): ?string
    {
        if (preg_match('/^\'((?:[^\'\\\\]|\\\\.)*)\'$/', $arg, $m) === 1) {
            return stripcslashes($m[1]);
        }

        if (preg_match('/^"((?:[^"\\\\]|\\\\.)*)"$/', $arg, $m) === 1) {
            return stripcslashes($m[1]);
        }

        return null;
    }

    /**
     * Rozwiązuje drugi argument do sluga: literał wprost, albo odwołanie do stałej
     * (`self::NAZWA`, `static::NAZWA`, `Klasa::NAZWA`) rozwiązane do jej definicji.
     *
     * @param  list<string>  $files
     * @param  array<string, string|null>  $classContentsCache
     * @return array{0: string|null, 1: 'literal'|'constant'|'unresolved'}
     */
    private function resolveSlug(string $arg, string $ownFileContents, array $files, array &$classContentsCache): array
    {
        $literal = $this->literalString($arg);

        if ($literal !== null) {
            return [$literal, 'literal'];
        }

        if (preg_match('/^(self|static|[A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/', trim($arg), $m) !== 1) {
            return [null, 'unresolved'];
        }

        [, $scope, $constName] = $m;

        $searchContents = $ownFileContents;

        if (! in_array($scope, ['self', 'static'], true)) {
            if (! array_key_exists($scope, $classContentsCache)) {
                $classContentsCache[$scope] = $this->findClassContents($scope, $files);
            }

            $searchContents = $classContentsCache[$scope];
        }

        if ($searchContents === null) {
            return [null, 'unresolved'];
        }

        $value = $this->constantValue($searchContents, $constName);

        if ($value === null) {
            return [null, 'unresolved'];
        }

        return [$value, 'constant'];
    }

    /** @param  list<string>  $files */
    private function findClassContents(string $className, array $files): ?string
    {
        foreach ($files as $file) {
            $contents = file_get_contents($file);

            if ($contents !== false && preg_match('/\bclass\s+'.preg_quote($className, '/').'\b/', $contents) === 1) {
                return $contents;
            }
        }

        return null;
    }

    private function constantValue(string $contents, string $name): ?string
    {
        $pattern = '/\bconst\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+)?'.preg_quote($name, '/').'\s*=\s*([\'"])((?:[^\'"\\\\]|\\\\.)*)\1\s*;/';

        if (preg_match($pattern, $contents, $m) === 1) {
            return stripcslashes($m[2]);
        }

        return null;
    }
}
