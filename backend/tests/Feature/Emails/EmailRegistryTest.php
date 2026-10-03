<?php

namespace Tests\Feature\Emails;

use App\Support\Emails\EmailTemplates;
use App\Support\NotificationTypes;
use Illuminate\Support\Facades\View;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;
use Tests\Unit\NotificationTypesRegistryTest;

/**
 * Rejestr: typ powiadomienia albo e-mail wysyłany bezpośrednio → numer
 * e-maila → szablon. Typ bez szablonu musi być jawnie oznaczony „tylko
 * dzwonek, bez e-maila” — i to wyłącznie wtedy, gdy zatwierdzona treść nie ma
 * dla niego e-maila (E-06, E-07 i E-28 usunięto).
 */
#[Group('wspolna-baza')]
class EmailRegistryTest extends TestCase
{
    private const string APP_DIR = __DIR__.'/../../../app';

    public function test_every_notification_type_has_a_template_or_is_marked_bell_only(): void
    {
        $missing = [];

        foreach (NotificationTypes::ALL as $type) {
            $templates = EmailTemplates::NOTIFICATIONS[$type] ?? null;
            $bellOnly = array_key_exists($type, EmailTemplates::BELL_ONLY);

            if (($templates !== null) !== $bellOnly) {
                continue;
            }

            $missing[] = $type;
        }

        $this->assertSame([], $missing, 'Typ bez szablonu i bez oznaczenia „tylko dzwonek” (albo z obydwoma).');
    }

    public function test_registry_names_only_known_types(): void
    {
        $known = array_merge(array_keys(EmailTemplates::NOTIFICATIONS), array_keys(EmailTemplates::BELL_ONLY));

        $this->assertSame([], array_values(array_diff($known, NotificationTypes::ALL)));
    }

    public function test_bell_only_types_are_exactly_the_removed_e_mails(): void
    {
        $this->assertSame(
            [
                'application.accepted' => 'E-06',
                'application.rejected' => 'E-07',
                'message.received' => 'E-28',
            ],
            EmailTemplates::BELL_ONLY,
        );

        foreach (EmailTemplates::BELL_ONLY as $number) {
            $this->assertArrayNotHasKey($number, EmailTemplates::TEMPLATES);
        }
    }

    public function test_every_registered_e_mail_points_to_an_existing_template(): void
    {
        $referenced = array_merge(
            array_merge(...array_values(EmailTemplates::NOTIFICATIONS)),
            array_values(EmailTemplates::MAILS),
        );

        foreach ($referenced as $number) {
            $this->assertArrayHasKey($number, EmailTemplates::TEMPLATES, $number);
        }

        foreach (array_keys(EmailTemplates::TEMPLATES) as $number) {
            $this->assertTrue(View::exists(EmailTemplates::view($number)), $number);
        }

        $this->assertSame(
            ['E-01', 'E-02', 'E-03', 'E-04', 'E-05'],
            array_values(EmailTemplates::MAILS),
        );
    }

    public function test_a_type_with_one_template_cannot_be_redirected_to_another(): void
    {
        $this->assertSame('E-26', EmailTemplates::forNotification('supervision.slot_cancelled'));
        $this->assertSame('E-27', EmailTemplates::forNotification('supervision.slot_cancelled', 'E-27'));

        $this->expectException(\InvalidArgumentException::class);
        EmailTemplates::forNotification('internship.accepted', 'E-02');
    }

    /**
     * Każde wywołanie `Notify::send` w kodzie aplikacji przekazuje dane, których
     * potrzebuje szablon jego typu (nazwany argument `email:` z kluczami
     * wymienionymi w rejestrze). Brak danych nie psuje wysyłki — kopia wraca
     * wtedy do dawnej postaci — ale tutaj byłby przeoczeniem.
     */
    public function test_every_notify_call_passes_the_data_its_template_needs(): void
    {
        $problems = [];
        $calls = 0;

        foreach (self::notifyCalls() as [$file, $type, $arguments]) {
            $calls++;
            $template = preg_match("/'template'\s*=>\s*'(E-\d+)'/", $arguments, $match) === 1 ? $match[1] : null;
            $number = EmailTemplates::BELL_ONLY[$type] ?? EmailTemplates::forNotification($type, $template);

            if (array_key_exists($type, EmailTemplates::BELL_ONLY)) {
                continue;
            }

            foreach (EmailTemplates::TEMPLATES[$number]['requires'] as $key) {
                if (preg_match("/\bemail:\s*\[.*'".preg_quote($key, '/')."'\s*=>/s", $arguments) !== 1) {
                    $problems[] = "{$file}: {$type} ({$number}) bez danych „{$key}”";
                }
            }
        }

        $this->assertGreaterThan(20, $calls);
        $this->assertSame([], $problems);
    }

    /**
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private static function notifyCalls(): array
    {
        $calls = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(self::APP_DIR));

        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            $code = (string) file_get_contents($file->getPathname());
            $offset = 0;

            while (($position = strpos($code, 'Notify::send(', $offset)) !== false) {
                $offset = $position + strlen('Notify::send(');
                $arguments = self::argumentList($code, $offset);

                if (preg_match("/^\s*[^,]+,\s*'([a-z_]+\.[a-z_0-9]+)'/", $arguments, $literal) === 1) {
                    $type = $literal[1];
                } elseif (preg_match('/^\s*[^,]+,\s*(?:self|static|[A-Za-z]+)::([A-Z_]+)/', $arguments, $constant) === 1) {
                    preg_match("/const\s+(?:string\s+)?{$constant[1]}\s*=\s*'([a-z_]+\.[a-z_0-9]+)'/", $code, $value);
                    $type = $value[1] ?? self::constantElsewhere($constant[1]);
                } else {
                    continue;
                }

                $calls[] = [basename($file->getPathname()), $type, $arguments];
            }
        }

        return $calls;
    }

    private static function constantElsewhere(string $name): string
    {
        [$sent] = NotificationTypesRegistryTest::typesSentInCode(self::APP_DIR);
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(self::APP_DIR));

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php'
                && preg_match("/const\s+(?:string\s+)?{$name}\s*=\s*'([a-z_]+\.[a-z_0-9]+)'/", (string) file_get_contents($file->getPathname()), $value) === 1
                && in_array($value[1], $sent, true)) {
                return $value[1];
            }
        }

        self::fail("Nie znaleziono stałej {$name}.");
    }

    /**
     * Treść listy argumentów od pozycji tuż za nawiasem otwierającym.
     */
    private static function argumentList(string $code, int $start): string
    {
        $depth = 0;
        $quote = null;

        for ($i = $start, $length = strlen($code); $i < $length; $i++) {
            $char = $code[$i];

            if ($quote !== null) {
                if ($char === '\\') {
                    $i++;
                } elseif ($char === $quote) {
                    $quote = null;
                }

                continue;
            }

            if ($char === "'" || $char === '"') {
                $quote = $char;
            } elseif ($char === '(' || $char === '[') {
                $depth++;
            } elseif ($char === ')' || $char === ']') {
                if ($depth === 0) {
                    return substr($code, $start, $i - $start);
                }
                $depth--;
            }
        }

        return substr($code, $start);
    }
}
