<?php

namespace Tests\Unit\DocumentTemplates;

use App\Services\DocumentTemplates\DocumentTemplateRenderer;
use App\Support\PdfService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * Wyraz dłuższy niż wiersz jest w dokumencie łamany, a nie wychodzi poza stronę.
 *
 * Reguła łamania stoi w jednym miejscu — w arkuszu bazowym usługi generowania,
 * dokładanym przed stylami wzoru — więc obejmuje każdy wzór bez zmiany jego treści.
 *
 * Miara to POŁOŻENIE znaków na stronie, a nie ich obecność w strumieniu dokumentu:
 * dla każdego wiersza tekstu z dokumentu brane są jego współrzędne, czcionka i
 * rozmiar, a litera wartości liczy się jako widoczna tylko wtedy, gdy leży w
 * granicach strony — w pionie i w poziomie. Wartość pola to litery „W” bez spacji;
 * liczone są ciągi co najmniej dwóch „W”, więc pojedyncze „W” ze stałego tekstu
 * wzoru nie wchodzą do sumy.
 *
 * Ograniczenie silnika, nazwane próbą: wiersz tabeli nie jest dzielony między
 * strony, więc wartość w komórce tabeli dłuższa niż miejsce do końca strony nie
 * jest widoczna w całości. Wartość o długości pola walidowanego (255 znaków)
 * mieści się w całości w każdym wzorze z repozytorium.
 *
 * Bez bazy: aplikacja jest podnoszona tutaj.
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/DocumentTemplates/PdfLongWordWrapTest.php`
 */
final class PdfLongWordWrapTest extends TestCase
{
    private const int LENGTH = 10000;

    /** Największa długość pola walidowanego (imię, nazwisko, ulica, miasto, nazwa edycji). */
    private const int FIELD_LENGTH = 255;

    private ?Application $app = null;

    protected function setUp(): void
    {
        parent::setUp();

        $app = require dirname(__DIR__, 3).'/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();
        $this->app = $app;
    }

    protected function tearDown(): void
    {
        $this->app?->flush();
        $this->app = null;
        HandleExceptions::flushState($this);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);

        parent::tearDown();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function templateTypes(): array
    {
        return [
            'porozumienie' => ['agreement'],
            'zaświadczenie' => ['attendance_certificate'],
        ];
    }

    /**
     * Każde pole walidowane (do 255 znaków) osobno, w każdym wzorze, który je pokazuje.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function validatedFields(): array
    {
        $cases = [];

        foreach (['agreement', 'attendance_certificate'] as $type) {
            foreach (['first_name', 'last_name', 'address_street', 'address_city', 'edition_name'] as $field) {
                $cases[$type.' '.$field] = [$type, $field];
            }
        }

        foreach (['first_name', 'last_name', 'edition_name'] as $field) {
            $cases['certificate '.$field] = ['certificate', $field];
        }

        return $cases;
    }

    /**
     * Najdłuższa wartość, jaką przyjmuje pole walidowane, jest widoczna w całości
     * w każdym wzorze z repozytorium. Wzór może pokazać pole więcej niż raz, stąd
     * suma jest wielokrotnością długości pola.
     */
    #[DataProvider('validatedFields')]
    public function test_value_of_the_longest_validated_field_is_visible_whole_in_every_repository_template(string $type, string $field): void
    {
        $placement = self::placement($this->documentWithField($type, $field, self::FIELD_LENGTH));

        $this->assertGreaterThanOrEqual(self::FIELD_LENGTH, $placement['total'], 'Wzór nie pokazuje tego pola.');
        $this->assertSame(0, $placement['total'] % self::FIELD_LENGTH);
        $this->assertSame(
            ['total' => $placement['total'], 'on_page' => $placement['total'], 'below' => 0, 'above' => 0, 'beyond_right_edge' => 0],
            $placement,
            'Wartość pola nie jest widoczna na stronie w całości.',
        );
    }

    /**
     * Tekst poza tabelą przechodzi na kolejne strony: żaden znak nie leży poza stroną.
     */
    public function test_long_value_outside_a_table_is_visible_whole_across_pages(): void
    {
        $certificate = self::placement($this->documentWithFirstName('certificate', self::LENGTH));
        $paragraph = self::placement((string) PdfService::generated('<html><head></head><body><p>'.str_repeat('W', self::LENGTH).'</p></body></html>')->output(['compress' => 0]));

        foreach (['certyfikat' => $certificate, 'akapit' => $paragraph] as $name => $placement) {
            $this->assertSame(
                ['total' => self::LENGTH, 'on_page' => self::LENGTH, 'below' => 0, 'above' => 0, 'beyond_right_edge' => 0],
                $placement,
                'Część wartości leży poza stroną: '.$name.'.',
            );
        }
    }

    /**
     * OGRANICZENIE, nie cel: silnik nie dzieli wiersza tabeli między strony. Wartość
     * 10 000 znaków w komórce tabeli jest połamana na wiersze (nic nie wychodzi za
     * prawą krawędź), ale tylko jej początek leży na stronie — reszta poniżej.
     * Liczby są z pomiaru; zmiana silnika albo wzoru, która to naprawi lub pogorszy,
     * ma tę próbę zaczerwienić.
     */
    #[DataProvider('templateTypes')]
    public function test_table_row_is_not_split_between_pages_so_an_oversized_cell_value_is_cut_off(string $type): void
    {
        $placement = self::placement($this->documentWithFirstName($type, self::LENGTH));

        $this->assertSame(
            ['total' => self::LENGTH, 'on_page' => 1680, 'below' => 8320, 'above' => 0, 'beyond_right_edge' => 0],
            $placement,
            'Zmieniło się ograniczenie: wartość w komórce tabeli dłuższa niż strona.',
        );
    }

    private function documentWithFirstName(string $type, int $length): string
    {
        return $this->documentWithField($type, 'first_name', $length);
    }

    private function documentWithField(string $type, string $field, int $length): string
    {
        $case = (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))[$type];
        $data = $case['data'];
        $allowed = isset($data['qr_svg']) ? [(string) $data['qr_svg']] : [];
        $value = str_repeat('W', $length);

        if (array_key_exists($field, $data)) {
            $data[$field] = $value;
        } else {
            // Certyfikat niesie osobę i edycję jako obiekty.
            [$holder, $attribute] = $field === 'edition_name' ? ['edition', 'name'] : ['user', $field];
            $object = clone $data[$holder];
            $object->{$attribute} = $value;
            $data[$holder] = $object;
        }

        return (string) PdfService::generated(DocumentTemplateRenderer::fileHtml($case['view'], $data), $allowed)->output(['compress' => 0]);
    }

    /**
     * Zwykłe dane: arkusz bazowy niczego nie zmienia — ta sama liczba stron i ten sam
     * tekst co w dokumencie wygenerowanym bez arkusza.
     */
    #[DataProvider('templateTypes')]
    public function test_ordinary_data_give_the_same_text_and_page_count_as_without_the_base_stylesheet(string $type): void
    {
        $case = (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))[$type];
        $html = DocumentTemplateRenderer::fileHtml($case['view'], $case['data']);

        $with = PdfService::generated($html);

        $without = PdfService::engine();
        $without->loadHtml($html, 'UTF-8');
        $without->render();

        $this->assertSame(1, $with->getCanvas()->get_page_count());
        $this->assertSame($without->getCanvas()->get_page_count(), $with->getCanvas()->get_page_count());
        // Dwa wydruki powstają w różnych chwilach, a silnik wpisuje do nagłówka dokumentu
        // datę utworzenia z zegara systemowego — przejście granicy sekundy między nimi
        // zmieniałoby wynik, choć treść jest ta sama. Wyrównane są wyłącznie te dwa pola
        // daty; cała reszta dokumentu jest porównywana bez zmian.
        $this->assertSame(
            self::strings(self::withoutDocumentDates((string) $without->output(['compress' => 0]))),
            self::strings(self::withoutDocumentDates((string) $with->output(['compress' => 0]))),
        );
    }

    public function test_template_can_override_the_base_stylesheet(): void
    {
        $word = str_repeat('W', 500);

        $default = self::runs((string) PdfService::generated('<html><head></head><body><p>'.$word.'</p></body></html>')->output(['compress' => 0]));
        $overridden = self::runs((string) PdfService::generated('<html><head><style>body { overflow-wrap: normal; }</style></head><body><p>'.$word.'</p></body></html>')->output(['compress' => 0]));

        $this->assertSame(500, array_sum($default));
        $this->assertLessThanOrEqual(44, max($default), 'Arkusz bazowy nie połamał wyrazu.');
        $this->assertSame([500], $overridden, 'Styl wzoru nie nadpisał arkusza bazowego.');
    }

    /**
     * Dokument bez dat nagłówka: pola `/CreationDate` i `/ModDate` dostają stałą wartość.
     *
     * Silnik bierze datę z zegara systemowego (`date()` w adapterze płótna), którego
     * próba nie może zamrozić — dwa wydruki tego samego wzoru różnią się więc datą, gdy
     * drugi powstaje w następnej sekundzie. Dokument jest tu zapisany bez kompresji;
     * dokładnie dwa pola daty muszą zostać znalezione, inaczej próba czerwienieje,
     * zamiast po cichu niczego nie wyrównać.
     */
    private static function withoutDocumentDates(string $bytes): string
    {
        $aligned = preg_replace(
            '~/(CreationDate|ModDate) \(D:\d{14}[+-]\d{2}\'\d{2}\'\)~',
            '/$1 (D:20000101000000+00\'00\')',
            $bytes,
            -1,
            $count,
        );

        if ($aligned === null || $count !== 2) {
            throw new RuntimeException('W nagłówku dokumentu nie ma dokładnie dwóch pól daty (znaleziono: '.$count.').');
        }

        return $aligned;
    }

    /**
     * Gdzie leżą litery wartości: na stronie, poniżej, powyżej albo za prawą krawędzią.
     *
     * Czyta gotowy plik (także skompresowany): rozmiar strony, wiersze tekstu z ich
     * współrzędnymi, czcionką i rozmiarem. Szerokość litery pochodzi z metryk silnika
     * dla czcionki zapisanej w pliku; nieznana czcionka przerywa próbę.
     *
     * @return array{total: int, on_page: int, below: int, above: int, beyond_right_edge: int}
     */
    public static function placement(string $bytes): array
    {
        $content = $bytes;
        preg_match_all('~stream\r?\n(.*?)\r?\nendstream~s', $bytes, $streams);

        foreach ($streams[1] as $stream) {
            $plain = @gzuncompress($stream);
            $content .= $plain === false ? '' : "\n".$plain;
        }

        if (preg_match('~/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]~', $bytes, $box) !== 1) {
            throw new RuntimeException('W pliku nie ma rozmiaru strony.');
        }

        [$pageWidth, $pageHeight] = [(float) $box[1], (float) $box[2]];

        // Nazwa zasobu czcionki (F1, F2, ...) -> nazwa czcionki zapisana w pliku.
        preg_match_all('~(\d+) 0 obj\s*<<(?:(?!endobj).)*?/BaseFont\s*/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)~s', $bytes, $objects, PREG_SET_ORDER);
        $baseFonts = [];

        foreach ($objects as $object) {
            $baseFonts[$object[1]] ??= $object[2];
        }

        preg_match_all('~/(F\d+)\s+(\d+) 0 R~', $bytes, $resources, PREG_SET_ORDER);
        $fonts = [];

        foreach ($resources as $resource) {
            if (isset($baseFonts[$resource[2]])) {
                $fonts[$resource[1]] = $baseFonts[$resource[2]];
            }
        }

        $families = [
            'Helvetica' => ['helvetica', 'normal'],
            'Helvetica-Bold' => ['helvetica', 'bold'],
            'DejaVuSans' => ['dejavu sans', 'normal'],
            'DejaVuSans-Bold' => ['dejavu sans', 'bold'],
            'DejaVuSerif' => ['dejavu serif', 'normal'],
            'DejaVuSerif-Bold' => ['dejavu serif', 'bold'],
        ];
        $metrics = PdfService::engine()->getFontMetrics();

        $placement = ['total' => 0, 'on_page' => 0, 'below' => 0, 'above' => 0, 'beyond_right_edge' => 0];
        preg_match_all('~BT\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Td\s+/(F\d+)\s+([\d.]+)\s+Tf\s+(.*?)\s+ET~s', $content, $lines, PREG_SET_ORDER);

        foreach ($lines as $line) {
            $text = str_replace(chr(0), '', implode('', self::strings($line[5])));

            $count = self::lettersOfTheValue($text);

            if ($count === 0) {
                continue;
            }

            $family = $families[$fonts[$line[3]] ?? ''] ?? null;

            if ($family === null) {
                throw new RuntimeException('Nieznana czcionka wiersza z wartością pola: '.($fonts[$line[3]] ?? $line[3]).'.');
            }

            $font = $metrics->getFont($family[0], $family[1]);
            [$x, $y, $size] = [(float) $line[1], (float) $line[2], (float) $line[4]];
            $placement['total'] += $count;

            if ($y < 0.0) {
                $placement['below'] += $count;
            } elseif ($y > $pageHeight) {
                $placement['above'] += $count;
            } else {
                // Tyle znaków wiersza, ile mieści się przed prawą krawędzią strony.
                $visible = strlen($text);

                while ($visible > 0 && ($x < 0.0 || $x + $metrics->getTextWidth(substr($text, 0, $visible), $font, $size) > $pageWidth)) {
                    $visible--;
                }

                $fits = self::lettersOfTheValue(substr($text, 0, $visible));
                $placement['on_page'] += $fits;
                $placement['beyond_right_edge'] += $count - $fits;
            }
        }

        return $placement;
    }

    /** Litery wartości pola w tekście wiersza: ciągi co najmniej dwóch „W”. */
    private static function lettersOfTheValue(string $text): int
    {
        preg_match_all('~W{2,}~', $text, $found);

        return array_sum(array_map(strlen(...), $found[0]));
    }

    /**
     * Napisy operatorów tekstu z dokumentu bez kompresji, w kolejności strumienia.
     *
     * @return list<string>
     */
    public static function strings(string $bytes): array
    {
        preg_match_all('~\[(.*?)\]\s*TJ|\((.*?)(?<!\\\\)\)\s*Tj~s', $bytes, $operators, PREG_SET_ORDER);
        $strings = [];

        foreach ($operators as $operator) {
            if ($operator[1] !== '') {
                preg_match_all('~\((.*?)(?<!\\\\)\)~s', $operator[1], $parts);
                $strings[] = implode('', $parts[1]);
            } else {
                $strings[] = $operator[2] ?? '';
            }
        }

        return $strings;
    }

    /**
     * Długości ciągów co najmniej dwóch liter „W” w napisach dokumentu.
     *
     * Czcionka wbudowana zapisuje znak dwoma bajtami (zerowy i właściwy), czcionka
     * podstawowa jednym — bajt zerowy jest pomijany, żeby miara była jedna.
     *
     * @return list<int>
     */
    public static function runs(string $bytes): array
    {
        $runs = [];

        foreach (self::strings($bytes) as $string) {
            preg_match_all('~W{2,}~', str_replace(chr(0), '', $string), $found);

            foreach ($found[0] as $run) {
                $runs[] = strlen($run);
            }
        }

        return $runs === [] ? [0] : $runs;
    }
}
