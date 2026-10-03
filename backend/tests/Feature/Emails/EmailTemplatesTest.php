<?php

namespace Tests\Feature\Emails;

use App\Support\Emails\EmailContact;
use App\Support\Emails\EmailRenderer;
use App\Support\Emails\EmailTemplates;
use App\Support\Emails\RenderedEmail;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Każdy szablon e-maila renderowany z przykładowymi danymi musi dać dokładnie
 * zatwierdzony wzorzec wyglądu: wersja tekstowa słowo w słowo równa
 * `tests/Fixtures/emails/E-NN.txt`, wersja HTML równa `E-NN.html` po zdjęciu
 * białych znaków między znacznikami. Przykładowe dane i adres platformy
 * (`https://psychon.example.org`) są te same co we wzorcu wyglądu. Wzorce
 * pokazują e-maile bez ustawionego kontaktu Fundacji — tak jak dziś wychodzą.
 */
#[Group('wspolna-baza')]
class EmailTemplatesTest extends TestCase
{
    public const string BASE_URL = 'https://psychon.example.org';

    private const string FIXTURES = __DIR__.'/../../Fixtures/emails';

    /** Wymyślony kontakt — tylko w próbach z ustawionym kontaktem. */
    private const string CONTACT = 'kontakt@niepodzielni.example.org';

    /**
     * E-maile, które trafiają do samej Fundacji — bez linii „Kontakt z Fundacją”
     * także przy ustawionym kontakcie.
     */
    private const array TEAM = ['E-05', 'E-17', 'E-22', 'E-39', 'E-41'];

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.url' => self::BASE_URL, 'app.frontend_url' => self::BASE_URL]);
    }

    /**
     * Wymyślone wartości przykładowe — te same, których używa wzorzec wyglądu.
     *
     * @return array<string, array<string, string>>
     */
    public static function exampleData(): array
    {
        $course = ['courseTitle' => 'Pierwsza pomoc psychologiczna'];
        $stage = ['stageTitle' => 'Rozmowa wspierająca'];
        $lesson = ['lessonTitle' => 'Kryzys a zaburzenie'];
        $slot = ['date' => '8 października 2026', 'time' => '18:00'];
        $help = [
            'reference' => 'POM-000142',
            'content' => "Nie widzę przycisku zapisu na superwizję, chociaż mam już przydzielonego superwizora.\nProszę o pomoc.",
        ];

        return [
            'E-01' => ['activationPath' => '/aktywacja?kod=7QK4-M2XP-91LD'],
            'E-02' => ['reason' => 'Liczba miejsc w tej edycji programu jest już wyczerpana.'],
            'E-03' => ['activationPath' => '/aktywacja?kod=7QK4-M2XP-91LD'],
            'E-04' => $help,
            'E-05' => $help + [
                'requesterName' => 'Anna Przykładowa',
                'requesterEmail' => 'anna.przykladowa@example.com',
                'role' => 'Wolontariusz',
                'screen' => 'Superwizja',
            ],
            'E-08' => $course,
            'E-09' => $course,
            'E-10' => $course + ['path' => '/panel/kursy/pierwsza-pomoc-psychologiczna'],
            'E-11' => $stage + ['stageNumber' => '2', 'path' => '/panel/kursy/rozmowa-wspierajaca'],
            'E-12' => $lesson,
            'E-13' => $lesson + ['path' => '/panel/kursy/pierwsza-pomoc-psychologiczna'],
            'E-14' => [],
            'E-15' => [],
            'E-16' => [],
            'E-17' => $stage + ['path' => '/admin/uczestniczki/1042'],
            'E-18' => [],
            'E-19' => ['documentKind' => 'Porozumienie wolontariackie'],
            'E-20' => [],
            'E-21' => [],
            'E-22' => [],
            'E-23' => [],
            'E-24' => [],
            'E-25' => $slot,
            'E-26' => $slot,
            'E-27' => $slot,
            'E-29' => [],
            'E-30' => [],
            'E-31' => ['deletionDate' => '2 listopada 2026 r.'],
            'E-32' => [],
            'E-33' => [],
            'E-34' => [],
            'E-35' => $stage + ['path' => '/panel/kursy/rozmowa-wspierajaca'],
            'E-36' => [],
            'E-37' => [],
            'E-38' => ['documentName' => 'Regulamin', 'path' => '/dokumenty-prawne/regulamin'],
            'E-39' => [],
            'E-40' => [],
            'E-41' => $lesson + $course,
        ];
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function numbers(): array
    {
        $numbers = [];
        foreach (array_keys(self::exampleData()) as $number) {
            $numbers[$number] = [$number];
        }

        return $numbers;
    }

    public function test_every_template_has_example_data_and_a_fixture(): void
    {
        $this->assertSame(array_keys(self::exampleData()), array_keys(EmailTemplates::TEMPLATES));
        $this->assertCount(38, EmailTemplates::TEMPLATES);

        foreach (array_keys(EmailTemplates::TEMPLATES) as $number) {
            $this->assertFileExists(self::FIXTURES."/{$number}.txt");
            $this->assertFileExists(self::FIXTURES."/{$number}.html");
        }
    }

    #[DataProvider('numbers')]
    public function test_template_renders_with_example_data(string $number): void
    {
        $email = $this->render($number);

        $this->assertStringStartsWith('PsychON: ', $email->subject);
        $this->assertLessThanOrEqual(60, mb_strlen($email->subject));
        $this->assertStringStartsWith('<!doctype html>', $email->html);
        $this->assertStringContainsString('<title>'.e($email->subject).'</title>', $email->html);
        $this->assertStringStartsWith('<div lang="pl"', $email->fragment);
        $this->assertStringStartsWith("Fundacja Niepodzielni · PsychON\n\nDzień dobry,\n\n", $email->text);
        $this->assertStringEndsWith("\nFundacja Niepodzielni\n", $email->text);
    }

    #[DataProvider('numbers')]
    public function test_plain_text_equals_the_approved_text_word_for_word(string $number): void
    {
        $email = $this->render($number);

        $this->assertSame(
            (string) file_get_contents(self::FIXTURES."/{$number}.txt"),
            "Temat: {$email->subject}\n\n{$email->text}",
        );
    }

    #[DataProvider('numbers')]
    public function test_html_equals_the_approved_look(string $number): void
    {
        $email = $this->render($number);

        $this->assertSame(
            self::withoutWhitespaceBetweenTags((string) file_get_contents(self::FIXTURES."/{$number}.html")),
            self::withoutWhitespaceBetweenTags($email->html),
        );
    }

    public function test_no_template_shows_a_contact_placeholder(): void
    {
        $this->assertNull(EmailContact::value());

        foreach (array_keys(EmailTemplates::TEMPLATES) as $number) {
            $email = $this->render($number);

            foreach (['tekst' => $email->text, 'HTML' => $email->html, 'temat' => $email->subject] as $kind => $content) {
                $this->assertStringNotContainsString('kontakt Fundacji z panelu administracji', $content, "{$number} ({$kind}): wypełniacz kontaktu.");
                $this->assertDoesNotMatchRegularExpression('/\[[^\]]*kontakt[^\]]*\]/iu', $content, "{$number} ({$kind}): nawias kwadratowy z „kontakt”.");
                $this->assertStringNotContainsString('Kontakt z Fundacją', $content, "{$number} ({$kind}): kontakt bez ustawionej wartości.");
            }
        }
    }

    public function test_without_a_contact_the_contact_sentences_and_boxes_are_left_out(): void
    {
        $withdrawn = $this->render('E-30');
        $deletion = $this->render('E-31');
        $blocked = $this->render('E-40');

        $this->assertStringContainsString("\nCo dalej: Jeśli chcesz dokończyć program, napisz do Fundacji przez okno „Potrzebujesz pomocy?” w panelu PsychON. Okno pomocy działa także po zakończeniu dostępu.\n", $withdrawn->text);
        $this->assertStringNotContainsString('skontaktować się z Fundacją', $withdrawn->text.$withdrawn->html);
        foreach ([$deletion, $blocked] as $email) {
            $this->assertStringNotContainsString('Co dalej', $email->text);
            $this->assertStringNotContainsString('Co dalej', $email->html);
            $this->assertStringNotContainsString('skontaktuj się z Fundacją', $email->text.$email->html);
        }
    }

    public function test_blank_contact_counts_as_not_set(): void
    {
        foreach (['', '   '] as $blank) {
            config(['emails.foundation_contact' => $blank]);

            $this->assertNull(EmailContact::value());
            $this->assertStringNotContainsString('Kontakt z Fundacją', $this->render('E-14')->text);
        }
    }

    #[DataProvider('numbers')]
    public function test_once_set_only_e_mails_outside_the_team_have_the_contact_line(string $number): void
    {
        config(['emails.foundation_contact' => self::CONTACT]);

        $email = $this->render($number);
        $team = in_array($number, self::TEAM, true);

        $this->assertSame($team, EmailTemplates::isTeam($number));
        $this->assertSame(! $team, str_contains($email->text, "\nKontakt z Fundacją: ".self::CONTACT."\n"));
        $this->assertSame(! $team, str_contains($email->html, 'Kontakt z Fundacją: '.self::CONTACT.'</p>'));
    }

    public function test_once_set_the_contact_stands_in_the_next_steps_box(): void
    {
        config(['emails.foundation_contact' => self::CONTACT]);

        $this->assertStringContainsString('Możesz też skontaktować się z Fundacją: '.self::CONTACT.'.', $this->render('E-30')->text);
        $this->assertStringContainsString("\nCo dalej: Jeśli chcesz zachować konto, skontaktuj się z Fundacją: ".self::CONTACT.".\n", $this->render('E-31')->text);
        $this->assertStringContainsString("\nCo dalej: Jeśli masz pytania, skontaktuj się z Fundacją Niepodzielni: ".self::CONTACT.".\n", $this->render('E-40')->text);
    }

    #[DataProvider('numbers')]
    public function test_no_link_points_outside_the_platform_address(string $number): void
    {
        $email = $this->render($number);

        $this->assertSame([], self::foreignLinks($email), "{$number}: odnośnik poza adresem platformy.");
    }

    public function test_the_link_check_catches_a_foreign_address(): void
    {
        $foreign = new RenderedEmail(
            'PsychON: próba',
            '<a href="https://example.net/panel">x</a>',
            '<a href="https://example.net/panel">x</a>',
            "Otwórz: https://example.net/panel\n",
        );
        $lookalike = new RenderedEmail(
            'PsychON: próba',
            '<a href="'.self::BASE_URL.'.example.net/panel">x</a>',
            '',
            '',
        );

        $this->assertNotSame([], self::foreignLinks($foreign));
        $this->assertNotSame([], self::foreignLinks($lookalike));
    }

    public function test_platform_address_comes_from_configuration(): void
    {
        config(['app.frontend_url' => 'https://inna-platforma.example.org/']);

        $email = EmailRenderer::render('E-14');

        $this->assertStringContainsString('https://inna-platforma.example.org/panel/staz', $email->text);
        $this->assertStringNotContainsString(self::BASE_URL, $email->html);
    }

    public function test_values_are_escaped_in_html_and_kept_as_typed_in_text(): void
    {
        $email = EmailRenderer::render('E-02', ['reason' => 'Powód <b>pogrubiony</b> & "cytat"']);

        $this->assertStringContainsString('Powód &lt;b&gt;pogrubiony&lt;/b&gt; &amp; &quot;cytat&quot;', $email->html);
        $this->assertStringNotContainsString('<b>pogrubiony</b>', $email->html);
        $this->assertStringContainsString("\nPowód: Powód <b>pogrubiony</b> & \"cytat\"\n", $email->text);
    }

    public function test_missing_template_data_is_refused(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        EmailRenderer::render('E-08');
    }

    private function render(string $number): RenderedEmail
    {
        return EmailRenderer::render($number, self::exampleData()[$number]);
    }

    /**
     * Każdy adres w e-mailu: `href` w HTML i każdy adres `http(s)://` w obu
     * wersjach. Dozwolony jest wyłącznie adres platformy (z ukośnikiem po
     * nazwie hosta) i `mailto:` w wierszu szczegółów.
     *
     * @return list<string>
     */
    public static function foreignLinks(RenderedEmail $email): array
    {
        $platform = rtrim(self::BASE_URL, '/').'/';
        $links = [];

        preg_match_all('/href="([^"]*)"/', $email->html, $hrefs);
        foreach ($hrefs[1] as $href) {
            $links[] = html_entity_decode($href, ENT_QUOTES | ENT_HTML5);
        }

        foreach ([$email->html, $email->text] as $content) {
            preg_match_all('#(?:https?|ftp)://[^\s"<>]+#i', $content, $urls);
            array_push($links, ...$urls[0]);
        }

        return array_values(array_filter(
            $links,
            fn (string $link): bool => ! str_starts_with($link, $platform)
                && ! (str_starts_with($link, 'mailto:') && ! str_contains($link, '/')),
        ));
    }

    private static function withoutWhitespaceBetweenTags(string $html): string
    {
        return trim((string) preg_replace('/>\s+</', '><', $html));
    }
}
