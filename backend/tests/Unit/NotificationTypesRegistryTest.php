<?php

namespace Tests\Unit;

use App\Support\NotificationTypes;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * Notification preferences are stored per type from `NotificationTypes::ALL`.
 * This test keeps that list equal to the types the code actually passes to
 * `Notify::send`, in both directions: a type sent but not registered could
 * not be switched off, and a registered type nobody sends is dead weight in
 * the preferences screen.
 *
 * The type argument is read from source with the PHP tokenizer (comments
 * stripped). It must be a string literal or a class constant holding one;
 * anything else fails, so the registry cannot be silently bypassed.
 */
final class NotificationTypesRegistryTest extends TestCase
{
    private const APP_DIR = __DIR__.'/../../app';

    public function test_registry_equals_the_types_sent_through_notify(): void
    {
        [$sent, $unresolved] = self::typesSentInCode(self::APP_DIR);

        $this->assertSame([], $unresolved, 'Notify::send type argument is neither a literal nor a class constant.');

        $registered = NotificationTypes::ALL;
        sort($registered);

        $this->assertSame($sent, $registered);
    }

    public function test_registry_has_no_duplicates(): void
    {
        $this->assertSame(NotificationTypes::ALL, array_values(array_unique(NotificationTypes::ALL)));
    }

    /**
     * @return array{0: list<string>, 1: list<string>}
     */
    public static function typesSentInCode(string $root): array
    {
        $sources = [];

        /** @var SplFileInfo $file */
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root)) as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $sources[$file->getPathname()] = self::withoutComments((string) file_get_contents($file->getPathname()));
            }
        }

        $constants = [];
        foreach ($sources as $code) {
            preg_match_all("/const\s+(?:string\s+)?([A-Z_]+)\s*=\s*'([a-z_]+\.[a-z_0-9]+)'/", $code, $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                $constants[$match[1]][] = $match[2];
            }
        }

        $sent = [];
        $unresolved = [];

        foreach ($sources as $path => $code) {
            $offset = 0;
            while (($position = strpos($code, 'Notify::send(', $offset)) !== false) {
                $offset = $position + strlen('Notify::send(');
                $argument = trim(self::argument($code, $offset, 1));

                if (preg_match("/^'([a-z_]+\.[a-z_0-9]+)'$/", $argument, $literal) === 1) {
                    $sent[] = $literal[1];
                } elseif (preg_match('/::([A-Z_]+)$/', $argument, $constant) === 1 && count($constants[$constant[1]] ?? []) === 1) {
                    $sent[] = $constants[$constant[1]][0];
                } else {
                    $unresolved[] = basename($path).': '.$argument;
                }
            }
        }

        $sent = array_values(array_unique($sent));
        sort($sent);

        return [$sent, $unresolved];
    }

    private static function withoutComments(string $code): string
    {
        $out = '';
        foreach (token_get_all($code) as $token) {
            if (is_array($token) && in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $out .= is_array($token) ? $token[1] : $token;
        }

        return $out;
    }

    /**
     * Returns the top-level argument at `$index` of the call whose argument
     * list starts at `$start` (just after the opening parenthesis).
     */
    private static function argument(string $code, int $start, int $index): string
    {
        $depth = 0;
        $quote = null;
        $current = 0;
        $buffer = '';

        for ($i = $start, $length = strlen($code); $i < $length; $i++) {
            $char = $code[$i];

            if ($quote !== null) {
                if ($char === '\\') {
                    $buffer .= $char.$code[++$i];

                    continue;
                }
                if ($char === $quote) {
                    $quote = null;
                }
            } elseif ($char === "'" || $char === '"') {
                $quote = $char;
            } elseif ($char === '(' || $char === '[') {
                $depth++;
            } elseif ($char === ')' || $char === ']') {
                if ($depth === 0) {
                    break;
                }
                $depth--;
            } elseif ($char === ',' && $depth === 0) {
                if ($current === $index) {
                    break;
                }
                $current++;
                $buffer = '';

                continue;
            }

            if ($current === $index) {
                $buffer .= $char;
            }
        }

        return $current === $index ? $buffer : '';
    }
}
