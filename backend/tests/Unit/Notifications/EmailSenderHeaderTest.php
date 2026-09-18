<?php

namespace Tests\Unit\Notifications;

use App\Http\Controllers\Api\V1\Admin\EmailController;
use App\Models\Application;
use App\Models\User;
use App\Services\H03\ApplicationInvitationMailer;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Przyrząd z decyzji architekta (2026-09-18): „porównaj tekst na ekranie z
 * nagłówkiem, który poczta wstawia na skrzynce próbnej".
 *
 * Woła przez refleksję DOKŁADNIE tę samą prywatną metodę, której używa
 * `Api\V1\Admin\EmailController::index()` do wypełnienia `meta.extra.from`
 * (a stamtąd czyta front `admin/emails/page.tsx`) — więc porównanie tutaj
 * z realnym nagłówkiem jest porównaniem tego, co naprawdę wyświetli ekran,
 * nie osobnej reimplementacji tej samej logiki.
 *
 * Zmierzone ograniczenie, opisane wprost (nie udajemy pełnego pokrycia):
 * PHPUnit w tym repo wymusza `MAIL_MAILER=array` (`backend/phpunit.xml`), a
 * współdzielona baza testowa nie była w tej turze dostępna, więc test jest
 * CELOWO jednostkowy, bez `RefreshDatabase` i bez zapisu modeli do bazy
 * (`Application`/`User`
 * budowane w pamięci — `ApplicationInvitationMailer::send()` czyta tylko
 * atrybuty, nie zapytuje bazy). Żaden test w tym repo nie łączy się z
 * prawdziwym SMTP/API Mailpita (`docker-compose.yml`, usługa `mailpit`) —
 * zamiast tego łapiemy zdarzenie `Illuminate\Mail\Events\MessageSent`,
 * które Laravel emituje PO realnym przejściu przez `Mailer::send()`: to
 * dokładnie ten sam obiekt wiadomości (z tym samym nagłówkiem `From`), który
 * trafiłby do transportu SMTP, gdyby `MAIL_MAILER=smtp` wskazywał na
 * Mailpita — transport `array` różni się wyłącznie tym, GDZIE wiadomość
 * ląduje na końcu, nie tym, co dopisuje w nagłówkach.
 *
 * Czego ten przyrząd NIE sprawdza (wprost, nie domyślnie): (a) zapisu na
 * prawdziwej skrzynce Mailpita ani jego panelu/REST API, (b) zachowania
 * realnego serwera SMTP (np. przepisania koperty przez pośredniczący MTA),
 * (c) transportu JSON z punktu dostępowego do przeglądarki (to pokrywa
 * osobny test Feature na `/admin/emails`, DB-zależny — w tej turze
 * niewykonany z tego samego powodu kolejki slotów, patrz meldunek).
 */
class EmailSenderHeaderTest extends TestCase
{
    private function ekranNadawca(): ?array
    {
        $metoda = new ReflectionMethod(EmailController::class, 'configuredSender');
        $metoda->setAccessible(true);

        return $metoda->invoke(new EmailController);
    }

    /**
     * Poprawka po czerwieni w bramce (2026-09-18): `$this->refreshApplication()`
     * mierzył wyłącznie MOJĄ maszynę, gdzie `MAIL_FROM_ADDRESS` było puste w
     * otoczeniu. Bramka ma w otoczeniu PRAWDZIWY skonfigurowany adres
     * (`platforma@niepodzielni.local`) — odświeżenie aplikacji tam wciąż
     * odczytuje ambientną zmienną, bo `refreshApplication()` startuje
     * kontener od nowa, ale nie gwarantuje, że proces PHP zapomni, co
     * dodało doń środowisko URUCHOMIENIA (ani czy konfiguracja jest
     * cache'owana) — czyli dokładnie „test mierzy maszynę, nie zmianę".
     *
     * Poprawiony przyrząd `require`-uje PRAWDZIWY plik `config/mail.php`
     * (ten sam, którego używa wdrożenie — więc to nadal pomiar realnego
     * kodu, nie reimplementacja) w chwili, gdy `MAIL_FROM_ADDRESS` ma
     * DOKŁADNIE tę wartość, o jaką prosi test — ustawioną tuż przed
     * wywołaniem i zdjętą zaraz po (`finally`), więc wynik nie zależy od
     * tego, co bramka miała w otoczeniu PRZED czy PO. Obliczoną tablicę
     * wstrzykuje przez `config([...])` do kontenera aplikacji, z którego
     * czyta kontroler — bez potrzeby przeładowania całej aplikacji ani
     * poufania w to, że `refreshApplication()`/cache konfiguracji na danym
     * hoście zachowają się tak samo jak na moim.
     */
    private function konfiguracjaZAdresu(?string $adres): array
    {
        $poprzedniGetenv = getenv('MAIL_FROM_ADDRESS');
        $bylUstawiony = $poprzedniGetenv !== false;
        $poprzedniEnv = $_ENV['MAIL_FROM_ADDRESS'] ?? null;
        $poprzedniServer = $_SERVER['MAIL_FROM_ADDRESS'] ?? null;

        if ($adres === null) {
            putenv('MAIL_FROM_ADDRESS');
            unset($_ENV['MAIL_FROM_ADDRESS'], $_SERVER['MAIL_FROM_ADDRESS']);
        } else {
            putenv('MAIL_FROM_ADDRESS='.$adres);
            $_ENV['MAIL_FROM_ADDRESS'] = $adres;
            $_SERVER['MAIL_FROM_ADDRESS'] = $adres;
        }

        try {
            return require base_path('config/mail.php');
        } finally {
            if ($bylUstawiony) {
                putenv('MAIL_FROM_ADDRESS='.$poprzedniGetenv);
            } else {
                putenv('MAIL_FROM_ADDRESS');
            }

            if ($poprzedniEnv !== null) {
                $_ENV['MAIL_FROM_ADDRESS'] = $poprzedniEnv;
            } else {
                unset($_ENV['MAIL_FROM_ADDRESS']);
            }

            if ($poprzedniServer !== null) {
                $_SERVER['MAIL_FROM_ADDRESS'] = $poprzedniServer;
            } else {
                unset($_SERVER['MAIL_FROM_ADDRESS']);
            }
        }
    }

    /**
     * Wstrzykuje wynik {@see konfiguracjaZAdresu()} do kontenera i dopiero
     * wtedy odpala `$sprawdzenie` — więc każda noga sama ustawia swój
     * świat i sama po sobie sprząta (env wraca w `finally` powyżej,
     * zanim ta metoda w ogóle dostanie sterowanie), niezależnie od tego,
     * co akurat stoi w otoczeniu uruchamiającym suitę.
     */
    private function zeSwiezoWczytanymNadawca(?string $adres, callable $sprawdzenie): void
    {
        $konfiguracja = $this->konfiguracjaZAdresu($adres);

        config([
            'mail.from' => $konfiguracja['from'],
            'mail.from_configured' => $konfiguracja['from_configured'],
        ]);

        $sprawdzenie();
    }

    public function test_screen_sender_text_matches_the_from_header_mail_actually_puts_on_the_message(): void
    {
        config([
            'mail.from.address' => 'inny.adres@inna.domena.test',
            'mail.from.name' => 'Nazwa Testowa',
            'mail.from_configured' => true,
        ]);

        // 1) Dokładnie to, co czyta i pokaże ekran.
        $ekranNadawca = $this->ekranNadawca();
        $this->assertNotNull($ekranNadawca);

        // 2) To, co poczta NAPRAWDĘ wstawia w nagłówku realnie wysyłanej
        //    wiadomości (ta sama ścieżka kodu co zaproszenie po akceptacji
        //    zgłoszenia, H03).
        Event::fake([MessageSent::class]);

        $application = new Application;
        $application->id = 1;

        $recipient = new User;
        $recipient->email = 'odbiorca@example.test';

        ApplicationInvitationMailer::send($application, $recipient, 'https://example.test/aktywacja?token=abc');

        Event::assertDispatched(MessageSent::class, function (MessageSent $event) use ($ekranNadawca): bool {
            $from = $event->message->getFrom();
            $this->assertNotEmpty($from, 'wiadomość musi mieć nagłówek From');

            $naglowek = $from[0];
            $this->assertSame($ekranNadawca['address'], $naglowek->getAddress());
            $this->assertSame($ekranNadawca['name'], $naglowek->getName() !== '' ? $naglowek->getName() : null);

            return true;
        });
    }

    /**
     * Pierwsza noga: zmienna NIE jest ustawiona — wymuszone jawnie (nie
     * tylko przez to, że `phpunit.xml`/`.env.testing` jej nie mają), więc
     * ten dowód nie zależy od tego, że ktoś kiedyś zostawi ambient tego
     * repo bez zmiany. Ekran ma powiedzieć „nieustawiony".
     */
    public function test_screen_reports_absence_when_the_variable_is_not_set(): void
    {
        $this->zeSwiezoWczytanymNadawca(null, function (): void {
            $this->assertFalse(config('mail.from_configured'), 'brak zmiennej ma znaczyć brak konfiguracji');
            $this->assertSame('', trim((string) config('mail.from.address')), 'wartość domyślna ma być pusta, nie zmyślona');
            $this->assertNull($this->ekranNadawca());
        });
    }

    /**
     * Druga noga: zmienna JEST ustawiona, ale na adres z domeny
     * zastrzeżonej przez RFC 2606 na przykłady/testy/dokumentację.
     * Architektura każe traktować to tak samo jak brak: ktoś wpisał
     * wypełniacz, nie prawdziwą konfigurację. Adres próbny pochodzi z
     * domeny zastrzeżonej dla przykładów — nie z domeny, która mogłaby
     * być czyjąś prawdziwą skrzynką.
     */
    public function test_screen_reports_absence_when_the_address_is_on_a_domain_reserved_for_examples(): void
    {
        $this->zeSwiezoWczytanymNadawca('ktos@example.com', function (): void {
            $this->assertFalse(config('mail.from_configured'), 'domena zastrzeżona ma liczyć się jak brak konfiguracji, mimo ustawionej zmiennej');
            $this->assertNull($this->ekranNadawca());
        });
    }

    /**
     * Kontrola negatywna do drugiej nogi: bez niej dowód nogi drugiej
     * byłby podejrzany o to, że metoda zawsze zwraca brak. Adres jest na
     * `.internal` — domenie zastrzeżonej przez IANA na użytek
     * wewnętrzny/testowy (RFC 9476), a więc dalej z „domeny przeznaczonej
     * na przykłady i testy", ale SPOZA listy w `config/mail.php`. Flaga ma
     * być prawdziwa, a ekran ma pokazać dokładnie ten adres.
     */
    public function test_screen_reports_the_address_when_the_domain_is_not_reserved(): void
    {
        $this->zeSwiezoWczytanymNadawca('kontrola@adres-testowy.internal', function (): void {
            $this->assertTrue(config('mail.from_configured'), 'domena spoza listy zastrzeżonych ma liczyć się jako prawdziwie skonfigurowana');

            $ekranNadawca = $this->ekranNadawca();
            $this->assertNotNull($ekranNadawca);
            $this->assertSame('kontrola@adres-testowy.internal', $ekranNadawca['address']);
        });
    }

    /**
     * Czwarta noga, granica dopasowania: `notexample.com` ZAWIERA ciąg
     * znaków `example.com`, ale to inna domena — nikt jej nie zastrzegł.
     * Reguła w `config/mail.php` sprawdza dokładne dopasowanie całej
     * domeny albo sufiks poprzedzony kropką (subdomenę), NIE samo
     * wystąpienie podciągu — więc ten adres ma przejść jako prawdziwy, nie
     * zostać złapany tylko dlatego, że zawiera znajome słowo. Bez tej nogi
     * druga noga byłaby podejrzana o to, że łapie za szeroko.
     */
    public function test_screen_reports_the_address_when_the_domain_only_resembles_a_reserved_one(): void
    {
        $this->zeSwiezoWczytanymNadawca('ktos@notexample.com', function (): void {
            $this->assertTrue(config('mail.from_configured'), 'nazwa bliska, ale różna od domeny zastrzeżonej, nie ma być łapana');

            $ekranNadawca = $this->ekranNadawca();
            $this->assertNotNull($ekranNadawca);
            $this->assertSame('ktos@notexample.com', $ekranNadawca['address']);
        });
    }

    /**
     * Ta sama ochrona jak wyżej, ale przez jawne `config([...])`: na
     * wypadek, gdyby ktoś kiedyś zmienił samą metodę kontrolera tak, żeby
     * nie ufała już fladze i sama sprawdzała treść adresu — to musi nadal
     * odrzucać wartość z domeny przykładowej.
     */
    public function test_placeholder_looking_address_is_not_reported_as_configured(): void
    {
        config([
            'mail.from.address' => 'hello@example.com',
            'mail.from.name' => 'Laravel',
            'mail.from_configured' => false,
        ]);

        $this->assertNull($this->ekranNadawca());
    }

    /**
     * Piąta noga (tabelaryczna): dwanaście przypadków rozpoznawania domeny
     * zapowiedzianych w komunikacie scalenia. Policzone wprost, nie
     * zmyślone — to jest KOMPLET dziesięciu końcówek zastrzeżonych, jakie
     * dziś istnieją w `config/mail.php::from_configured` (`example.com`,
     * `example.net`, `example.org`, `example.edu`, `localhost`,
     * `localdomain`, `.example`, `.test`, `.invalid`, `.localhost`), plus
     * jedna subdomena (dowód, że dopasowanie łapie subdomeny, nie tylko
     * dokładny ciąg) i jedna kontrola negatywna — nazwa bliska, ale różna
     * (`notexample.com`), która MA przejść jako prawdziwa. 10 + 1 + 1 = 12
     * wierszy. Gdyby lista w `config/mail.php` kiedyś urosła lub
     * skurczyła się, ten test i tak sprawdzi dokładnie te dwanaście
     * przypadków — nie „całą listę, jaka akurat jest".
     *
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function przypadkiRozpoznawaniaDomeny(): array
    {
        return [
            'example.com — zastrzeżona (RFC 2606)' => ['ktos@example.com', false],
            'example.net — zastrzeżona (RFC 2606)' => ['ktos@example.net', false],
            'example.org — zastrzeżona (RFC 2606)' => ['ktos@example.org', false],
            'example.edu — zastrzeżona (RFC 2606)' => ['ktos@example.edu', false],
            'localhost — zastrzeżona (nazwa maszyny lokalnej)' => ['ktos@localhost', false],
            'localdomain — zastrzeżona (nazwa maszyny lokalnej)' => ['ktos@localdomain', false],
            '.example — zastrzeżona końcówka TLD (RFC 2606)' => ['ktos@sub.example', false],
            '.test — zastrzeżona końcówka TLD (RFC 2606)' => ['ktos@sub.test', false],
            '.invalid — zastrzeżona końcówka TLD (RFC 2606)' => ['ktos@sub.invalid', false],
            '.localhost — zastrzeżona końcówka TLD (RFC 2606)' => ['ktos@sub.localhost', false],
            'subdomena example.com — nadal zastrzeżona' => ['ktos@mail.example.com', false],
            'notexample.com — nazwa bliska, ale różna, NIE zastrzeżona' => ['ktos@notexample.com', true],
        ];
    }

    #[DataProvider('przypadkiRozpoznawaniaDomeny')]
    public function test_dwanascie_przypadkow_rozpoznawania_domeny(string $adres, bool $oczekiwanaKonfiguracja): void
    {
        $this->zeSwiezoWczytanymNadawca($adres, function () use ($adres, $oczekiwanaKonfiguracja): void {
            $this->assertSame(
                $oczekiwanaKonfiguracja,
                config('mail.from_configured'),
                sprintf('adres "%s" — flaga from_configured ma być %s', $adres, $oczekiwanaKonfiguracja ? 'prawdziwa' : 'fałszywa')
            );

            if ($oczekiwanaKonfiguracja) {
                $ekranNadawca = $this->ekranNadawca();
                $this->assertNotNull($ekranNadawca, sprintf('adres "%s" ma być pokazany, nie ukryty', $adres));
                $this->assertSame($adres, $ekranNadawca['address']);
            } else {
                $this->assertNull($this->ekranNadawca(), sprintf('adres "%s" ma być traktowany jak brak konfiguracji', $adres));
            }
        });
    }
}
