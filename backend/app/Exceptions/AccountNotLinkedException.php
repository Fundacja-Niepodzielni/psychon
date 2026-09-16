<?php

namespace App\Exceptions;

use App\Services\Keycloak\KeycloakGuardResolver;

/**
 * „Token jest ważny, ale nie ma do niego konta w PsychON" — jedyna odmowa
 * uwierzytelnienia, która nazywa siebie i oddaje pytającemu identyfikator
 * (`sub`) z JEGO WŁASNEGO tokena. Osoba, która właśnie się zalogowała,
 * może go odczytać z ekranu i przekazać administratorowi, zamiast dostać
 * nieodróżnialne „zaloguj się, aby kontynuować".
 *
 * Dwie granice, obie celowe:
 *
 * 1. Identyfikator wraca WYŁĄCZNIE do posiadacza tego samego tokena.
 *    Rzuca go jedno miejsce — {@see KeycloakGuardResolver}
 *    po tym, jak token przeszedł pełną walidację (podpis, wystawca,
 *    odbiorca, ważność) i po sprawdzeniu, czy sesja nie została
 *    unieważniona. Odmowa dla tokena, któremu nie ufamy, nigdy tędy
 *    nie idzie i nigdy nie niesie identyfikatora.
 *
 * 2. Identyfikator nie trafia do ŻADNEGO dziennika — ani w całości, ani
 *    jako skrót. Dlatego `report()` zwraca `true`: domyślna obsługa
 *    wyjątków traktuje to jako „zgłoszone" i nie zapisuje wpisu. Gdyby
 *    tego nie było, `sub` nie wyciekłby wprawdzie treścią komunikatu
 *    (komunikat go nie zawiera), ale sam wpis byłby śladem po odmowie,
 *    którego ta decyzja nie przewiduje.
 */
final class AccountNotLinkedException extends ApiException
{
    public function __construct(string $sub)
    {
        parent::__construct(
            401,
            'konto_niepowiazane',
            'To konto nie jest jeszcze powiązane z kontem w PsychON. Przekaż administratorowi identyfikator z tej odpowiedzi.',
            reason: ['sub' => $sub],
        );
    }

    /**
     * Nie zapisuj tego w dzienniku (patrz punkt 2 opisu klasy). Zwrócenie
     * czegokolwiek innego niż `false` zatrzymuje domyślne raportowanie.
     */
    public function report(): bool
    {
        return true;
    }
}
