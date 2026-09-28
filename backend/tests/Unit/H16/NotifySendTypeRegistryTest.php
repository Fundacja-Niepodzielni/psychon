<?php

namespace Tests\Unit\H16;

use App\Support\NotificationSettings;
use FilesystemIterator;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Przyrząd źródłowy: każdy typ użyty w wywołaniu `Notify::send(...)` w kodzie
 * produkcyjnym (`backend/app/**​/*.php`) musi należeć do zbioru typów, które panel
 * ustawień powiadomień administracji (`NotificationSettings::TYPES`) zna — albo do
 * jednego z dwóch jawnych wyjątków spoza panelu: `supervision.reminder` (ma własny
 * blok z godziną wysyłki, nie jest w `TYPES`) oraz stała czatu
 * (`message.received`, `thread.member_added` — poza listą przełączników do czasu
 * osobnej decyzji). Typ spoza obu zbiorów jest zdarzeniem, którym panel administracji
 * nie potrafi sterować, a nikt tego świadomie nie zdecydował — naruszenie WPROST.
 *
 * Drugi argument nie musi być literałem stringowym wprost: forma `self::NAZWA`,
 * `static::NAZWA` albo `Klasa::NAZWA` jest rozwiązywana do literału ze znalezionej
 * definicji stałej, tą samą metodą co świadek rejestru slugów audytu
 * (`Tests\Unit\H20\AuditLogSlugRegistryTest`). Rozwiązanie, którego nie da się
 * dokończyć, jest naruszeniem WPROST: plik:wiersz, bez cichego pominięcia.
 *
 * Bez bazy i bez aplikacji Laravel — czysty skan plików, dlatego zwykły
 * `PHPUnit\Framework\TestCase`.
 */
final class NotifySendTypeRegistryTest extends TestCase
{
    private const string NEEDLE = 'Notify::send';

    /**
     * Typy poza `NotificationSettings::TYPES`, które są jawną, świadomą decyzją —
     * nie luką: `supervision.reminder` ma własny blok ustawień (godzina wysyłki),
     * a dwa typy czatu zostają poza listą przełączników do osobnej decyzji.
     */
    private const array KNOWN_OUTSIDE_PANEL = [
        'supervision.reminder',
        'message.received',
        'thread.member_added',
    ];

    public function test_every_notify_send_type_belongs_to_the_known_registry(): void
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
        $uniqueTypes = [];
        $classContentsCache = [];

        foreach ($files as $file) {
            $contents = file_get_contents($file);

            if ($contents === false || ! str_contains($contents, self::NEEDLE)) {
                continue;
            }

            // Skan pomija komentarze (docbloki wspominające `Notify::send()` jako
            // opis, bez rzeczywistego wywołania, np. `ApplicationInvitationMailer.php`)
            // — bez tego pusty nawias w zdaniu opisowym liczyłby się jako wywołanie
            // bez argumentów i fałszywie czerwienił przyrząd.
            $codeOnly = $this->stripComments($contents);

            if (! str_contains($codeOnly, self::NEEDLE)) {
                continue;
            }

            $relative = 'backend/app'.substr($file, strlen($root));

            foreach ($this->findCalls($codeOnly) as [$argsText, $line]) {
                $callCount++;
                $location = sprintf('%s:%d', $relative, $line);

                $secondArgument = $this->secondArgument($argsText);

                if ($secondArgument === null) {
                    $unresolvedCount++;
                    $violations[] = sprintf(
                        '%s — nie udało się wydzielić drugiego argumentu wywołania Notify::send(...)',
                        $location,
                    );

                    continue;
                }

                [$resolvedType, $kind] = $this->resolveType($secondArgument, $contents, $files, $classContentsCache);

                if ($kind === 'literal') {
                    $literalCount++;
                } elseif ($kind === 'constant') {
                    $constantResolvedCount++;
                } else {
                    $unresolvedCount++;
                    $violations[] = sprintf(
                        '%s — typ nie jest literałem stringowym ani rozwiązywalnym odwołaniem do stałej: `%s`',
                        $location,
                        trim($secondArgument),
                    );

                    continue;
                }

                $uniqueTypes[$resolvedType] = true;

                $inPanel = in_array($resolvedType, NotificationSettings::TYPES, true);
                $isKnownOutside = in_array($resolvedType, self::KNOWN_OUTSIDE_PANEL, true);

                if (! $inPanel && ! $isKnownOutside) {
                    $violations[] = sprintf(
                        '%s — typ "%s" spoza NotificationSettings::TYPES i spoza KNOWN_OUTSIDE_PANEL',
                        $location,
                        $resolvedType,
                    );
                }
            }
        }

        $denominator = sprintf(
            'wywołań Notify::send: %d, literałów: %d, stałych rozwiązanych: %d, '
            .'nierozwiązanych: %d, różnych typów: %d, znanych wyjątków poza panelem: %d',
            $callCount,
            $literalCount,
            $constantResolvedCount,
            $unresolvedCount,
            count($uniqueTypes),
            count(self::KNOWN_OUTSIDE_PANEL),
        );

        fwrite(STDERR, '[notify-send-type-registry] '.$denominator.PHP_EOL);

        self::assertGreaterThan(
            0,
            $callCount,
            'Zero wywołań Notify::send w backend/app — przyrząd nic by nie mierzył. '.$denominator,
        );

        self::assertSame(
            [],
            $violations,
            $denominator."\n".implode("\n", $violations),
        );
    }

    /**
     * Zamienia treść komentarzy (jednoliniowych, blokowych, dokbloków) na spacje,
     * zachowując znaki nowej linii — żeby numery linii w reszcie skanu się zgadzały.
     * Kod poza komentarzami (w tym literały stringowe) zostaje bez zmian.
     */
    private function stripComments(string $contents): string
    {
        $tokens = token_get_all($contents);
        $out = '';

        foreach ($tokens as $token) {
            if (is_array($token)) {
                [$id, $text] = $token;

                if ($id === T_COMMENT || $id === T_DOC_COMMENT) {
                    $out .= preg_replace('/[^\n]/', ' ', $text);

                    continue;
                }

                $out .= $text;

                continue;
            }

            $out .= $token;
        }

        return $out;
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

    /** @return list<array{0: string, 1: int}> */
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
     * @param  list<string>  $files
     * @param  array<string, string|null>  $classContentsCache
     * @return array{0: string|null, 1: 'literal'|'constant'|'unresolved'}
     */
    private function resolveType(string $arg, string $ownFileContents, array $files, array &$classContentsCache): array
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
