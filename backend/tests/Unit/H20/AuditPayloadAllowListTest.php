<?php

namespace Tests\Unit\H20;

use App\Support\AuditDetailsView;
use FilesystemIterator;
use PhpToken;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Przyrząd źródłowy: ładunek (`details`) każdego wywołania `AuditLog::record(...)` w kodzie
 * produkcyjnym (`backend/app/**​/*.php`) niesie wyłącznie klucze z jawnej listy dozwolonych
 * dla danego sluga. W ładunkach rejestru zdarzeń nie ma tekstu wpisanego ręcznie — rejestr
 * przyjmuje identyfikatory, kody ze słowników zamkniętych i flagi; treść wpisana w formularzu
 * żyje w rekordzie dziedzinowym.
 *
 * Czerwono, gdy:
 *   - wywołanie niesie klucz spoza listy swojego sluga,
 *   - slug wywołania nie ma wpisu na liście (nowe wywołanie bez wpisu),
 *   - ładunku nie da się rozłożyć na klucze (klucz nie jest literałem, wpis bez klucza,
 *     ładunek będący wyrażeniem, którego skan nie rozwiąże) — niedokończone rozwiązanie
 *     jest naruszeniem wprost, nie pominięciem,
 *   - wpis listy jest nieświeży (slug nigdzie nie jest zapisywany albo klucz nigdzie nie
 *     występuje) — test jest dwustronny, jak przyrząd rejestru slugów,
 *   - lista dozwolonych zawiera nazwę pola, które widok odczytu uznaje za tekst wpisany
 *     ręcznie (`AuditDetailsView::TEXT_FIELDS`).
 *
 * Rozbiór po tokenach PHP (`PhpToken`), bez bazy i bez aplikacji Laravel: komentarze i
 * napisy nie są wywołaniami. Ładunek bywa literałem tablicy, zmienną składaną w tym samym
 * pliku (`$details = [...]`, `$details['klucz'] = ...`) albo tablicą z rozwinięciem
 * parametru metody pomocniczej (`[...$companion]`) — wtedy klucze są zbierane z literałów
 * przekazywanych przez wywołania tej metody w tym samym pliku.
 */
final class AuditPayloadAllowListTest extends TestCase
{
    /**
     * Dozwolone klucze ładunku według sluga. Pusta lista = zdarzenie bez ładunku
     * (`details = null`). Zmiana tej listy jest decyzją o treści rejestru, nie poprawką testu.
     *
     * @var array<string, list<string>>
     */
    private const array ALLOWED = [
        'access.extended' => ['previous_access_expires_at', 'access_expires_at'],
        'application.accepted' => ['application_id', 'decision', 'user_id', 'role', 'force'],
        'application.rejected' => ['application_id', 'decision'],
        'assignment.created' => ['course_id', 'lesson_id', 'instructor_id'],
        'assignment.removed' => ['course_id', 'lesson_id', 'instructor_id'],
        'attempt.finished' => ['test_id', 'attempt_number', 'score_percent', 'passed'],
        'attempts.reset' => ['test_id', 'cleared'],
        'certificate.issued' => ['number', 'edition_id'],
        'certificate.revoked' => ['number'],
        'cooperation_request.answered' => ['request_id', 'status'],
        'cooperation_request.created' => ['request_id'],
        'course.created' => ['slug', 'is_published'],
        'course.deleted' => ['slug'],
        'course.updated' => [
            'op', 'changed', 'lesson_id', 'material_id', 'course_id', 'topic_id',
            'lesson_ids', 'course_ids', 'user_ids',
        ],
        'document.generated' => ['type', 'number'],
        'edition.updated' => ['changed'],
        'internship.accepted' => ['entry_id'],
        'internship.rejected' => ['entry_id'],
        'internship.returned' => ['entry_id'],
        'legal_document.accepted' => ['type', 'version'],
        'legal_document.published' => ['type', 'version'],
        'notification_settings.updated' => ['types', 'supervision_reminder'],
        'profile.accepted' => ['profile_id'],
        'profile.returned' => ['profile_id'],
        'profile.withdrawn' => ['profile_id'],
        'sensitive.viewed' => ['file_type', 'file_id'],
        'supervision.attendance_marked' => ['slot_id', 'user_id', 'attendance_before', 'attendance_after'],
        'supervision.slot_cancelled' => ['slot_id', 'supervisor_id', 'signups_released'],
        'supervisor.assigned' => ['volunteer_id', 'supervisor_id'],
        'supervisor.unassigned' => ['volunteer_id', 'supervisor_id'],
        'trial_data.purged' => ['deleted', 'kept_accounts', 'executor'],
        'user.anonymized' => [],
        'user.blocked' => ['previous_status'],
        'user.created' => ['role'],
        'user.unblocked' => ['previous_status', 'restored_status'],
        'user.updated' => ['changed', 'invitation_renewed'],
        'workshop.completed' => ['edition_id'],
    ];

    public function test_no_audit_payload_carries_a_key_outside_the_allowed_list_of_its_slug(): void
    {
        $root = dirname(__DIR__, 3).'/app';
        self::assertDirectoryExists($root, 'Korzeń app/ nie istnieje — nie ma czego skanować.');

        $files = $this->phpFiles($root);
        self::assertNotEmpty($files, 'Skan nie znalazł ani jednego pliku .php — przyrząd nic by nie mierzył.');

        $violations = [];
        $callCount = 0;
        $withPayload = 0;
        $withoutPayload = 0;
        $seenKeys = [];
        $seenSlugs = [];

        foreach ($files as $file) {
            $contents = file_get_contents($file);

            if ($contents === false || ! str_contains($contents, 'AuditLog')) {
                continue;
            }

            $tokens = $this->significantTokens($contents);
            $relative = 'backend/app'.substr($file, strlen($root));

            foreach ($this->findCalls($tokens) as [$callIndex, $args, $line]) {
                $callCount++;
                $location = sprintf('%s:%d', $relative, $line);

                $slug = $this->slugOf($args[1] ?? [], $contents, $files);

                if ($slug === null) {
                    $violations[] = sprintf('%s — slug nie jest literałem ani rozwiązywalną stałą', $location);

                    continue;
                }

                $seenSlugs[$slug] = true;

                if (! array_key_exists($slug, self::ALLOWED)) {
                    $violations[] = sprintf('%s — slug "%s" nie ma wpisu na liście dozwolonych kluczy', $location, $slug);
                }

                [$keys, $problems] = $this->payloadKeys($args[3] ?? null, $tokens, $callIndex);

                foreach ($problems as $problem) {
                    $violations[] = sprintf('%s — slug "%s": %s', $location, $slug, $problem);
                }

                $keys === [] ? $withoutPayload++ : $withPayload++;

                foreach ($keys as $key) {
                    $seenKeys[$slug][$key] = true;

                    if (array_key_exists($slug, self::ALLOWED) && ! in_array($key, self::ALLOWED[$slug], true)) {
                        $violations[] = sprintf(
                            '%s — slug "%s": klucz "%s" spoza listy dozwolonych (%s)',
                            $location,
                            $slug,
                            $key,
                            implode(', ', self::ALLOWED[$slug]) ?: 'brak ładunku',
                        );
                    }
                }
            }
        }

        // Druga strona: wpis listy musi odpowiadać kodowi.
        foreach (self::ALLOWED as $slug => $allowedKeys) {
            if (! array_key_exists($slug, $seenSlugs)) {
                $violations[] = sprintf('lista dozwolonych — slug "%s" nie jest już nigdzie zapisywany; usuń wpis', $slug);

                continue;
            }

            foreach ($allowedKeys as $key) {
                if (! isset($seenKeys[$slug][$key])) {
                    $violations[] = sprintf('lista dozwolonych — klucz "%s" sluga "%s" nie występuje w żadnym wywołaniu; usuń go', $key, $slug);
                }
            }
        }

        $denominator = sprintf(
            'wywołań AuditLog::record: %d, z ładunkiem: %d, bez ładunku: %d, różnych slugów: %d, wpisów listy: %d',
            $callCount,
            $withPayload,
            $withoutPayload,
            count($seenSlugs),
            count(self::ALLOWED),
        );

        fwrite(STDERR, '[audit-payload-allow-list] '.$denominator.PHP_EOL);

        self::assertGreaterThan(0, $callCount, 'Zero wywołań AuditLog::record w backend/app — przyrząd nic by nie mierzył.');
        self::assertSame([], $violations, $denominator."\n".implode("\n", $violations));
    }

    public function test_the_allowed_list_has_no_field_that_the_read_view_treats_as_hand_typed_text(): void
    {
        $offending = [];

        foreach (self::ALLOWED as $slug => $keys) {
            foreach ($keys as $key) {
                if (in_array($key, AuditDetailsView::TEXT_FIELDS, true)) {
                    $offending[] = $slug.'.'.$key;
                }
            }
        }

        self::assertSame([], $offending, 'Lista dozwolonych kluczy nie może zawierać pól z tekstem wpisanym ręcznie.');
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

    /** @return list<PhpToken> */
    private function significantTokens(string $contents): array
    {
        $tokens = [];

        foreach (PhpToken::tokenize($contents) as $token) {
            if ($token->is([T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG, T_OPEN_TAG_WITH_ECHO])) {
                continue;
            }

            $tokens[] = $token;
        }

        return $tokens;
    }

    /**
     * Wywołania `AuditLog::record(...)`: [indeks tokenu nazwy klasy, argumenty najwyższego poziomu, wiersz].
     *
     * @param  list<PhpToken>  $tokens
     * @return list<array{0: int, 1: list<list<PhpToken>>, 2: int}>
     */
    private function findCalls(array $tokens): array
    {
        $calls = [];
        $count = count($tokens);

        for ($i = 0; $i + 3 < $count; $i++) {
            if (! $tokens[$i]->is([T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED])) {
                continue;
            }

            $segments = explode('\\', $tokens[$i]->text);

            if (end($segments) !== 'AuditLog'
                || $tokens[$i + 1]->text !== '::'
                || $tokens[$i + 2]->text !== 'record'
                || $tokens[$i + 3]->text !== '(') {
                continue;
            }

            $calls[] = [$i, $this->splitArguments($tokens, $i + 3), $tokens[$i]->line];
        }

        return $calls;
    }

    /**
     * @param  list<PhpToken>  $tokens
     * @return list<list<PhpToken>>
     */
    private function splitArguments(array $tokens, int $openIndex): array
    {
        $args = [];
        $current = [];
        $depth = 0;
        $count = count($tokens);

        for ($i = $openIndex; $i < $count; $i++) {
            $text = $tokens[$i]->text;

            if (in_array($text, ['(', '[', '{'], true)) {
                $depth++;

                if ($depth === 1) {
                    continue;
                }
            } elseif (in_array($text, [')', ']', '}'], true)) {
                $depth--;

                if ($depth === 0) {
                    if ($current !== []) {
                        $args[] = $current;
                    }

                    return $args;
                }
            } elseif ($text === ',' && $depth === 1) {
                $args[] = $current;
                $current = [];

                continue;
            }

            $current[] = $tokens[$i];
        }

        return $args;
    }

    /**
     * @param  list<PhpToken>  $arg
     * @param  list<string>  $files
     */
    private function slugOf(array $arg, string $ownContents, array $files): ?string
    {
        if (count($arg) === 1 && $arg[0]->is(T_CONSTANT_ENCAPSED_STRING)) {
            return $this->stringValue($arg[0]->text);
        }

        if (count($arg) === 3 && $arg[0]->is(T_STRING) && $arg[1]->text === '::' && $arg[2]->is(T_STRING)) {
            $scope = $arg[0]->text;
            $contents = $ownContents;

            if (! in_array($scope, ['self', 'static'], true)) {
                $contents = null;

                foreach ($files as $file) {
                    $candidate = file_get_contents($file);

                    if ($candidate !== false && preg_match('/\bclass\s+'.preg_quote($scope, '/').'\b/', $candidate) === 1) {
                        $contents = $candidate;

                        break;
                    }
                }
            }

            if ($contents === null) {
                return null;
            }

            $pattern = '/\bconst\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+)?'.preg_quote($arg[2]->text, '/').'\s*=\s*([\'"])((?:[^\'"\\\\]|\\\\.)*)\1\s*;/';

            return preg_match($pattern, $contents, $m) === 1 ? stripcslashes($m[2]) : null;
        }

        return null;
    }

    private function stringValue(string $literal): string
    {
        return stripcslashes(substr($literal, 1, -1));
    }

    /**
     * Klucze ładunku jednego wywołania i lista powodów, dla których rozbiór się nie powiódł.
     *
     * @param  list<PhpToken>|null  $arg
     * @param  list<PhpToken>  $fileTokens
     * @return array{0: list<string>, 1: list<string>}
     */
    private function payloadKeys(?array $arg, array $fileTokens, int $callIndex): array
    {
        if ($arg === null || $arg === []) {
            return [[], []];
        }

        if ($arg[0]->text === '[') {
            return $this->arrayKeys($arg, $fileTokens, $callIndex);
        }

        if (count($arg) === 1 && $arg[0]->is(T_VARIABLE)) {
            return $this->variableKeys($arg[0]->text, $fileTokens, $callIndex);
        }

        return [[], ['ładunek nie jest literałem tablicy ani zmienną — skan go nie rozwiąże']];
    }

    /**
     * @param  list<PhpToken>  $arrayTokens  tokeny od `[` do pasującego `]`
     * @param  list<PhpToken>  $fileTokens
     * @return array{0: list<string>, 1: list<string>}
     */
    private function arrayKeys(array $arrayTokens, array $fileTokens, int $callIndex): array
    {
        $keys = [];
        $problems = [];

        foreach ($this->splitEntries($arrayTokens) as $entry) {
            if ($entry === []) {
                continue;
            }

            if ($entry[0]->is(T_ELLIPSIS)) {
                if (count($entry) !== 2 || ! $entry[1]->is(T_VARIABLE)) {
                    $problems[] = 'rozwinięcie w ładunku nie jest zmienną';

                    continue;
                }

                [$spreadKeys, $spreadProblems] = $this->parameterKeys($entry[1]->text, $fileTokens, $callIndex);
                $keys = array_merge($keys, $spreadKeys);
                $problems = array_merge($problems, $spreadProblems);

                continue;
            }

            $arrowAt = null;
            $depth = 0;

            foreach ($entry as $position => $token) {
                if (in_array($token->text, ['(', '[', '{'], true)) {
                    $depth++;
                } elseif (in_array($token->text, [')', ']', '}'], true)) {
                    $depth--;
                } elseif ($depth === 0 && $token->is(T_DOUBLE_ARROW)) {
                    $arrowAt = $position;

                    break;
                }
            }

            if ($arrowAt === null) {
                $problems[] = 'wpis ładunku bez klucza';

                continue;
            }

            if ($arrowAt !== 1 || ! $entry[0]->is(T_CONSTANT_ENCAPSED_STRING)) {
                $problems[] = 'klucz ładunku nie jest literałem stringowym';

                continue;
            }

            $keys[] = $this->stringValue($entry[0]->text);
        }

        return [$keys, $problems];
    }

    /**
     * Wpisy tablicy na pierwszym poziomie zagnieżdżenia (bez nawiasów zewnętrznych).
     *
     * @param  list<PhpToken>  $arrayTokens
     * @return list<list<PhpToken>>
     */
    private function splitEntries(array $arrayTokens): array
    {
        $entries = [];
        $current = [];
        $depth = 0;

        foreach ($arrayTokens as $token) {
            if (in_array($token->text, ['(', '[', '{'], true)) {
                $depth++;

                if ($depth === 1) {
                    continue;
                }
            } elseif (in_array($token->text, [')', ']', '}'], true)) {
                $depth--;

                if ($depth === 0) {
                    break;
                }
            } elseif ($token->text === ',' && $depth === 1) {
                $entries[] = $current;
                $current = [];

                continue;
            }

            $current[] = $token;
        }

        $entries[] = $current;

        return $entries;
    }

    /**
     * Zmienna ładunku składana w pliku: `$zm = [...]` i `$zm['klucz'] = ...`.
     *
     * @param  list<PhpToken>  $fileTokens
     * @return array{0: list<string>, 1: list<string>}
     */
    private function variableKeys(string $variable, array $fileTokens, int $callIndex): array
    {
        $keys = [];
        $problems = [];
        $found = 0;
        $count = count($fileTokens);

        for ($i = 0; $i < $count; $i++) {
            if (! $fileTokens[$i]->is(T_VARIABLE) || $fileTokens[$i]->text !== $variable) {
                continue;
            }

            if (($fileTokens[$i + 1]->text ?? '') === '=' && ($fileTokens[$i + 2]->text ?? '') === '[') {
                $found++;
                [$assigned, $assignedProblems] = $this->arrayKeys($this->bracketed($fileTokens, $i + 2), $fileTokens, $callIndex);
                $keys = array_merge($keys, $assigned);
                $problems = array_merge($problems, $assignedProblems);

                continue;
            }

            if (($fileTokens[$i + 1]->text ?? '') === '[' && ($fileTokens[$i + 3]->text ?? '') === ']' && ($fileTokens[$i + 4]->text ?? '') === '=') {
                $found++;

                if ($fileTokens[$i + 2]->is(T_CONSTANT_ENCAPSED_STRING)) {
                    $keys[] = $this->stringValue($fileTokens[$i + 2]->text);
                } else {
                    $problems[] = sprintf('klucz dopisywany do %s nie jest literałem stringowym', $variable);
                }
            }
        }

        if ($found === 0) {
            $problems[] = sprintf('zmienna ładunku %s nie jest składana w tym pliku literałem — skan jej nie rozwiąże', $variable);
        }

        return [$keys, $problems];
    }

    /**
     * Klucze z literałów przekazywanych w miejsce parametru metody pomocniczej, w której stoi wywołanie.
     *
     * @param  list<PhpToken>  $fileTokens
     * @return array{0: list<string>, 1: list<string>}
     */
    private function parameterKeys(string $variable, array $fileTokens, int $callIndex): array
    {
        $functionAt = null;

        for ($i = $callIndex; $i >= 0; $i--) {
            if ($fileTokens[$i]->is(T_FUNCTION)) {
                $functionAt = $i;

                break;
            }
        }

        if ($functionAt === null || ! ($fileTokens[$functionAt + 1] ?? null)?->is(T_STRING)) {
            return [[], [sprintf('rozwinięcie %s poza nazwaną metodą — skan go nie rozwiąże', $variable)]];
        }

        $name = $fileTokens[$functionAt + 1]->text;
        $parameters = [];
        $depth = 0;

        for ($i = $functionAt + 2, $count = count($fileTokens); $i < $count; $i++) {
            $text = $fileTokens[$i]->text;

            if ($text === '(') {
                $depth++;

                continue;
            }

            if ($text === ')') {
                $depth--;

                if ($depth === 0) {
                    break;
                }

                continue;
            }

            if ($depth === 1 && $fileTokens[$i]->is(T_VARIABLE)) {
                $parameters[] = $text;
            }
        }

        $position = array_search($variable, $parameters, true);

        if ($position === false) {
            return [[], [sprintf('%s nie jest parametrem metody %s — skan go nie rozwiąże', $variable, $name)]];
        }

        $keys = [];
        $problems = [];
        $callers = 0;

        for ($i = 0, $count = count($fileTokens); $i + 3 < $count; $i++) {
            if (in_array($fileTokens[$i]->text, ['self', 'static'], true)
                && $fileTokens[$i + 1]->text === '::'
                && $fileTokens[$i + 2]->text === $name
                && $fileTokens[$i + 3]->text === '(') {
                $callers++;
                $args = $this->splitArguments($fileTokens, $i + 3);
                $passed = $args[$position] ?? null;

                if ($passed === null || $passed[0]->text !== '[') {
                    $problems[] = sprintf('wywołanie %s::%s w wierszu %d nie przekazuje literału tablicy', $fileTokens[$i]->text, $name, $fileTokens[$i]->line);

                    continue;
                }

                [$passedKeys, $passedProblems] = $this->arrayKeys($passed, $fileTokens, $i);
                $keys = array_merge($keys, $passedKeys);
                $problems = array_merge($problems, $passedProblems);
            }
        }

        if ($callers === 0) {
            $problems[] = sprintf('metoda %s nie ma wywołań w tym pliku — skan nie rozwiąże %s', $name, $variable);
        }

        return [$keys, $problems];
    }

    /**
     * @param  list<PhpToken>  $tokens
     * @return list<PhpToken> tokeny od `[` pod indeksem do pasującego `]` włącznie
     */
    private function bracketed(array $tokens, int $openIndex): array
    {
        $out = [];
        $depth = 0;

        for ($i = $openIndex, $count = count($tokens); $i < $count; $i++) {
            $text = $tokens[$i]->text;
            $out[] = $tokens[$i];

            if (in_array($text, ['(', '[', '{'], true)) {
                $depth++;
            } elseif (in_array($text, [')', ']', '}'], true)) {
                $depth--;

                if ($depth === 0) {
                    break;
                }
            }
        }

        return $out;
    }
}
