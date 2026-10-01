<?php

namespace Tests\Unit\DocumentTemplates;

use App\Services\DocumentTemplates\DocumentTemplateFields;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Reguła treści wzoru i podstawianie pól — bez bazy i bez aplikacji.
 *
 * Treść wzoru to tekst z miejscami na pola `{{ $nazwa }}` z zamkniętej listy
 * rodzaju. Reguła odmawia wszystkiego, co wygląda jak składnia szablonu albo
 * kod; podstawianie jest zwykłą zamianą tekstu i niczego nie wykonuje.
 *
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/DocumentTemplates/DocumentTemplateFieldsTest.php`
 */
final class DocumentTemplateFieldsTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function refusedContents(): array
    {
        return [
            'dyrektywa wykonująca kod' => ['<p>@php file_put_contents("/tmp/x", "1"); @endphp</p>', 'znaku „@”'],
            'dyrektywa warunku' => ['@if (true) tak @endif', 'znaku „@”'],
            'reguła CSS @page' => ['<style>@page { margin: 0; }</style>', 'znaku „@”'],
            'reguła CSS @media' => ['<style> @media print { p { color: red; } }</style>', 'znaku „@”'],
            'wyrażenie wywołujące funkcję' => ['<p>{{ file_put_contents("/tmp/x", "1") }}</p>', 'nawiasy klamrowe'],
            'pole z wartością domyślną' => ["<p>{{ \$number ?? '—' }}</p>", 'nawiasy klamrowe'],
            'dostęp do obiektu' => ['<p>{{ $user->first_name }}</p>', 'nawiasy klamrowe'],
            'pole bez spacji' => ['<p>{{$number}}</p>', 'nawiasy klamrowe'],
            'komentarz szablonu' => ['<p>{{-- uwaga --}}</p>', 'nawiasy klamrowe'],
            'pole w polu' => ['<p>{{ {{ $number }} }}</p>', 'nawiasy klamrowe'],
            'pole spoza listy rodzaju' => ['<p>{{ $hours_accepted }}</p>', 'Pole „hours_accepted” nie istnieje'],
            'pole nieznane' => ['<p>{{ $password }}</p>', 'Pole „password” nie istnieje'],
            'wypisanie bez zamiany znaków' => ['<p>{!! $number !!}</p>', '{!! … !!}'],
            'znacznik PHP' => ['<p><?php echo 1; ?></p>', '„<?”'],
            'krótki znacznik PHP' => ['<p><?= 1 ?></p>', '„<?”'],
            'znacznik PHP sklejony z pola' => ['<{{ $number }}?php echo 1;', '„<?”'],
        ];
    }

    #[DataProvider('refusedContents')]
    public function test_rule_refuses_template_syntax_and_code(string $content, string $expected): void
    {
        $violation = DocumentTemplateFields::violation('agreement', $content);

        $this->assertNotNull($violation);
        $this->assertStringContainsString($expected, $violation);
        // Komunikat mówi też, co wolno — i nie powtarza treści wzoru.
        $this->assertStringContainsString('Wolno wstawić wyłącznie pola z listy tego dokumentu', $violation);
        $this->assertStringContainsString('{{ $nazwa }}', $violation);
        $this->assertStringNotContainsString('file_put_contents', $violation);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function acceptedContents(): array
    {
        return [
            'sam tekst' => ['<h1>Porozumienie</h1><p>Zwykły tekst wzoru.</p>'],
            'pola z listy' => ['<p>Numer {{ $number }}, {{ $first_name }} {{ $last_name }}</p>'],
            'adres e-mail w treści' => ['<p>Kontakt: biuro@example.test, w sprawie {{ $number }}.</p>'],
            'małpa po cyfrze i po znaku słowa' => ['<p>2@3, a_@b</p>'],
            'pojedyncze nawiasy klamrowe w CSS' => ['<style>p { color: #111; } td { padding: 4px; }</style>'],
            'encje i znaki specjalne' => ['<p>&middot; „cudzysłów” — 100% &amp; więcej; a < b > c ? d</p>'],
        ];
    }

    #[DataProvider('acceptedContents')]
    public function test_rule_accepts_text_fields_from_the_list_and_email_addresses(string $content): void
    {
        $this->assertNull(DocumentTemplateFields::violation('agreement', $content));
    }

    public function test_field_list_is_closed_per_type(): void
    {
        $this->assertSame(
            ['number', 'edition_name', 'generated_at', 'first_name', 'last_name', 'pesel', 'address_street', 'address_zip', 'address_city', 'email', 'phone', 'edition_starts_at', 'edition_ends_at'],
            DocumentTemplateFields::names('agreement'),
        );
        $this->assertSame(
            ['number', 'edition_name', 'generated_at', 'first_name', 'last_name', 'pesel', 'address_street', 'address_zip', 'address_city', 'hours_accepted', 'consultations_count', 'edition_starts_at', 'edition_ends_at'],
            DocumentTemplateFields::names('attendance_certificate'),
        );
        $this->assertSame(
            ['certificate_number', 'first_name', 'last_name', 'edition_year', 'edition_name', 'issued_at', 'verify_url', 'qr_svg'],
            DocumentTemplateFields::names('certificate'),
        );
        $this->assertSame([], DocumentTemplateFields::names('nieznany'));

        // Pole jednego rodzaju nie jest polem drugiego.
        $this->assertNull(DocumentTemplateFields::violation('attendance_certificate', '{{ $hours_accepted }}'));
        $this->assertNotNull(DocumentTemplateFields::violation('certificate', '{{ $number }}'));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function seedTemplates(): array
    {
        return ['agreement' => ['agreement'], 'attendance_certificate' => ['attendance_certificate'], 'certificate' => ['certificate']];
    }

    #[DataProvider('seedTemplates')]
    public function test_seed_template_meets_the_rule_and_fits_the_limit_three_times_over(string $type): void
    {
        $content = (string) file_get_contents(dirname(__DIR__, 3).'/resources/document-templates/'.$type.'.html');

        $this->assertNull(DocumentTemplateFields::violation($type, $content));
        $this->assertLessThanOrEqual(DocumentTemplateFields::MAX_CONTENT_LENGTH, 3 * mb_strlen($content));

        preg_match_all('/\{\{ \$([a-z_]+) \}\}/', $content, $used);
        $this->assertSame([], array_values(array_diff(array_unique($used[1]), DocumentTemplateFields::names($type))));
    }

    public function test_substitution_is_plain_text_replacement_with_escaping_and_executes_nothing(): void
    {
        $html = DocumentTemplateFields::render(
            'agreement',
            '<p>{{ $first_name }}|{{ $last_name }}|{{ $number }}|{{ $nieznane }}|@php echo 1; @endphp|<?php echo 2; ?>|{!! $pesel !!}|{{ strtoupper("x") }}</p>',
            ['first_name' => '<b>Zażółć</b> & "Jaźń"', 'last_name' => '{{ $pesel }}', 'pesel' => '00000000000'],
        );

        $this->assertSame(
            '<p>&lt;b&gt;Zażółć&lt;/b&gt; &amp; &quot;Jaźń&quot;|{{ $pesel }}|—|{{ $nieznane }}|@php echo 1; @endphp|<?php echo 2; ?>|{!! $pesel !!}|{{ strtoupper("x") }}</p>',
            $html,
        );
    }

    public function test_missing_values_get_the_single_default_of_the_field(): void
    {
        $values = DocumentTemplateFields::values('agreement', ['first_name' => 'Zażółć', 'address_zip' => null, 'phone' => ['tablica']]);

        $this->assertSame('Zażółć', $values['first_name']);
        $this->assertSame('—', $values['number']);
        $this->assertSame('', $values['last_name']);
        $this->assertSame('', $values['address_zip']);
        $this->assertSame('', $values['address_city']);
        $this->assertSame('—', $values['phone']);

        $this->assertSame(
            ['certificate_number' => '', 'first_name' => '', 'last_name' => '', 'edition_year' => '', 'edition_name' => '', 'issued_at' => '', 'verify_url' => '', 'qr_svg' => ''],
            DocumentTemplateFields::values('certificate', []),
        );
    }
}
