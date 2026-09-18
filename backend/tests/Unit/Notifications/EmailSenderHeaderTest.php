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
     * Kontrola negatywna do drugiej nogi, PO dopisaniu `.internal` do listy
     * zastrzeżonych końcówek (`config/mail.php`, końcówki nietrasowalne
     * IANA/RFC 9476: `.local`, `.internal`, `.lan`, `.home.arpa`): adres na
     * `.internal` dziś JEST na liście, więc to już nie jest „domena spoza
     * listy" — jest dokładnie tym, co lista miała zacząć łapać. Trzymanie
     * tej nazwy testu przy starym twierdzeniu (prawdziwy adres) byłoby
     * fałszem po zmianie, więc noga przechodzi na stronę zastrzeżonych:
     * flaga ma być fałszywa, ekran ma pokazać brak, dokładnie jak w drugiej
     * nodze. Dowód „domena spoza listy przechodzi jako prawdziwa" przenosi
     * się do `test_screen_reports_the_address_when_the_domain_only_resembles_a_reserved_one`
     * (końcówka podobna, ale nienależąca do listy) — bez niego ta rodzina
     * nóg w ogóle nie miałaby przypadku odróżniającego „złapane" od
     * „puszczone".
     */
    public function test_screen_reports_absence_when_the_domain_is_reserved_as_non_routable(): void
    {
        $this->zeSwiezoWczytanymNadawca('kontrola@adres-testowy.internal', function (): void {
            $this->assertFalse(config('mail.from_configured'), 'domena .internal jest dziś na liście zastrzeżonych (nietrasowalna, IANA/RFC 9476) — ma liczyć się jak brak konfiguracji');
            $this->assertNull($this->ekranNadawca());
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
     * Piąta noga (tabelaryczna): przypadki rozpoznawania domeny, policzone
     * wprost, nie zmyślone. Dziś lista zastrzeżonych końcówek w
     * `config/mail.php::from_configured` ma CZTERNAŚCIE wpisów:
     * `example.com`, `example.net`, `example.org`, `example.edu`,
     * `localhost`, `localdomain`, `.example`, `.test`, `.invalid`,
     * `.localhost` (dziesięć „starych", RFC 2606 + nazwa maszyny lokalnej),
     * plus `.local`, `.internal`, `.lan`, `.home.arpa` (cztery „nowe",
     * końcówki nietrasowalne IANA — RFC 9476 dla `.internal`/`.home.arpa`,
     * zwyczajowe dla `.local`/`.lan`).
     *
     * Do dziesięciu starych wierszy dochodzą cztery nowe (jeden na
     * końcówkę — każdy pada NIEZALEŻNIE, jeśli tylko JEGO końcówka zniknie
     * z listy; sprawdzone ręczną kontrolą negatywną opisaną w meldunku),
     * jedna subdomena (dowód, że dopasowanie łapie subdomeny), jedna
     * kontrola negatywna ogólna (`notexample.com`) i CZTERY kontrole
     * rozróżniające dokładnie dla nowych końcówek — adres, który TYLKO
     * przypomina jedną z nich, ale kończy się czymś innym, ma przejść jako
     * prawdziwy: `.locale` (nie `.local`), `.internally` (nie `.internal`),
     * `.lancaster`-owy ogon (nie `.lan`) i samo `.arpa` bez `home.` przed
     * nim (nie `.home.arpa`). Bez tych czterech nie było wiadomo, czy nowe
     * reguły łapią dokładnie swój sufiks, czy każdy ciąg zaczynający się
     * podobnie. 10 + 4 + 1 + 1 + 4 = 20 wierszy.
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
            '.local — zastrzeżona końcówka nietrasowalna (IANA)' => ['ktos@urzadzenie.local', false],
            '.internal — zastrzeżona końcówka nietrasowalna (RFC 9476)' => ['ktos@uslugi.internal', false],
            '.lan — zastrzeżona końcówka nietrasowalna (sieć domowa/biurowa)' => ['ktos@router.lan', false],
            '.home.arpa — zastrzeżona końcówka nietrasowalna (RFC 8375)' => ['ktos@urzadzenie.home.arpa', false],
            '.locale nie jest .local — nazwa bliska, NIE zastrzeżona' => ['ktos@urzadzenie.locale', true],
            '.internally nie jest .internal — nazwa bliska, NIE zastrzeżona' => ['ktos@uslugi.internally', true],
            '.lancaster nie jest .lan — nazwa bliska, NIE zastrzeżona' => ['ktos@router.lancaster', true],
            '.arpa bez „home." nie jest .home.arpa — NIE zastrzeżona' => ['ktos@urzadzenie.arpa', true],
        ];
    }

    #[DataProvider('przypadkiRozpoznawaniaDomeny')]
    public function test_dwadziescia_przypadkow_rozpoznawania_domeny(string $adres, bool $oczekiwanaKonfiguracja): void
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

    /**
     * Szósta noga, rozróżniająca: `.local` i `.localhost` to DWIE RÓŻNE
     * końcówki na liście (`config/mail.php`), dopisane w różnym czasie i
     * z różnego powodu (`.local` — mDNS/IANA nietrasowalna; `.localhost` —
     * RFC 2606, nazwa maszyny lokalnej). Ryzyko, które ta noga sprawdza W
     * SUICIE (nie skryptem pomocniczym obok niej — pomiar poza suitą nie
     * pilnuje niczego jutro): że dopasowanie jednej końcówki złapie też
     * adresy drugiej tylko dlatego, że `.localhost` zaczyna się od tych
     * samych liter co `.local`. Dowodzi tego przez cztery adresy na raz,
     * każdy sprawdzony do końca (adres, flaga, treść ekranu, nie tylko
     * `assertTrue`/`assertFalse`):
     *
     *  (a) `urzadzenie.local`      — kończy się `.local`, NIE `.localhost` — zastrzeżony;
     *  (b) `urzadzenie.localhost`  — kończy się `.localhost`, NIE `.local` — zastrzeżony;
     *  (c) `localhost` (sama nazwa, bez kropki przed nią) — dopasowanie po
     *      RÓWNOŚCI całej domeny (reguła `localhost` bez kropki), a nie po
     *      sufiksie `.localhost` — inny mechanizm dopasowania niż (b);
     *  (d) `urzadzenie.locahost`   — literówka, kończy się ANI `.local` ANI
     *      `.localhost` — MA przejść jako prawdziwy; bez tej nogi (a) i (b)
     *      byłyby podejrzane o to, że łapią każdy ciąg zaczynający się od
     *      „loca".
     */
    public function test_local_i_localhost_sa_rozroznialne_a_localhost_jako_nazwa_calkowita_to_nie_to_samo_co_koncowka(): void
    {
        $this->zeSwiezoWczytanymNadawca('urzadzenie@urzadzenie.local', function (): void {
            $this->assertFalse(config('mail.from_configured'), '.local ma być zastrzeżona');
            $this->assertNull($this->ekranNadawca());
        });

        $this->zeSwiezoWczytanymNadawca('urzadzenie@urzadzenie.localhost', function (): void {
            $this->assertFalse(config('mail.from_configured'), '.localhost ma być zastrzeżona, niezależnie od .local');
            $this->assertNull($this->ekranNadawca());
        });

        $this->zeSwiezoWczytanymNadawca('ktos@localhost', function (): void {
            $this->assertFalse(config('mail.from_configured'), 'sama nazwa "localhost" (bez kropki) ma być zastrzeżona przez dopasowanie równości, nie przez sufiks .localhost');
            $this->assertNull($this->ekranNadawca());
        });

        $this->zeSwiezoWczytanymNadawca('urzadzenie@urzadzenie.locahost', function (): void {
            $this->assertTrue(config('mail.from_configured'), 'literówka "locahost" nie jest ani .local, ani .localhost — ma przejść jako prawdziwy adres');

            $ekranNadawca = $this->ekranNadawca();
            $this->assertNotNull($ekranNadawca);
            $this->assertSame('urzadzenie@urzadzenie.locahost', $ekranNadawca['address']);
        });
    }
}
