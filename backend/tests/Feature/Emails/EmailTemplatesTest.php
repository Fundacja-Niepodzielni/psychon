<?php

namespace Tests\Feature\Emails;

use App\Support\Emails\EmailContact;
use App\Support\Emails\EmailRenderer;
use App\Support\Emails\EmailTemplates;
use App\Support\Emails\RenderedEmail;
use App\Support\NotificationSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Każdy szablon e-maila renderowany z przykładowymi danymi musi dać dokładnie
 * zatwierdzony wzorzec wyglądu: wersja tekstowa słowo w słowo równa
 * `tests/Fixtures/emails/E-NN.txt`, wersja HTML równa `E-NN.html` po zdjęciu
 * białych znaków między znacznikami. Przykładowe dane i adres platformy
 * (`https://psychon.example.org`) są te same co we wzorcu wyglądu; kontakt
 * Fundacji ma wartość wzorca („[kontakt Fundacji z panelu administracji]”).
 */
class EmailTemplatesTest extends TestCase
{
    use RefreshDatabase;

    public const string BASE_URL = 'https://psychon.example.org';

    private const string FIXTURES = __DIR__.'/../../Fixtures/emails';

    /**
     * E-maile, które trafiają do samej Fundacji — bez linii „Kontakt z Fundacją”.
     */
    private const array TEAM = ['E-05', 'E-17', 'E-22', 'E-39', 'E-41'];

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.url' => self::BASE_URL, 'app.frontend_url' => self::BASE_URL]);
        NotificationSettings::put(['email_contact' => EmailContact::PLACEHOLDER]);
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

    #[DataProvider('numbers')]
    public function test_only_e_mails_outside_the_team_have_the_contact_line(string $number): void
    {
        $email = $this->render($number);
        $team = in_array($number, self::TEAM, true);

        $this->assertSame($team, EmailTemplates::isTeam($number));
        $this->assertSame(! $team, str_contains($email->text, "\nKontakt z Fundacją: "));
        $this->assertSame(! $team, str_contains($email->html, 'Kontakt z Fundacją: '));
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
