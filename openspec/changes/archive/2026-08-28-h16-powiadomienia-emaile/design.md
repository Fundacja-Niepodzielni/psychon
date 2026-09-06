## Context

Zob. `proposal.md` — „Why". Poniżej wyłącznie decyzje techniczne faktycznie obecne
w scalonym kodzie (`NotificationController`, `Admin/EmailController`, `app/Support/Notify.php`).

Stan zastany, zweryfikowany w kodzie:

- `Notify::send(User $user, string $type, string $title, string $body, ?string $link = null): Notification`
  to zamrożona sygnatura startera — H16 jej nie modyfikuje, tylko buduje odczyt/UI wokół
  tabel, które ona zapisuje.
- Tabele `notifications` (`user_id, type, title, body, link, read_at`) i `emails`
  (`to_email, to_user_id, subject, body_html, status, related_type/id, sent_at`) pochodzą
  z jednej migracji startera (`2026_01_01_000090_create_communication_tables.php`).
- `Notify::send` zapisuje obie tabele w jednej `DB::transaction` — nie ma scenariusza,
  w którym powiadomienie istnieje bez odpowiadającego mu wiersza w `emails`, albo odwrotnie.
- `body_html` jest budowany jako `nl2br(e($body))` — uciekane HTML, bezpieczne do
  wyrenderowania przez `dangerouslySetInnerHTML` na froncie bez dodatkowego oczyszczania.

## Goals / Non-Goals

**Goals:**

- Każdy pakiet-nadawca (H01, H05, H10, H11, H13, H14, docelowo H03/H08/H09/H15/H17) dostaje
  identyczną gwarancję: jedno wywołanie `Notify::send` = jedno powiadomienie w dzwonku +
  jeden wiersz w skrzynce e-maili administracji, atomowo.
- Właściciel powiadomienia nigdy nie widzi cudzych danych; próba dostępu do cudzego
  powiadomienia po `id` jest nieodróżnialna od próby dostępu do nieistniejącego (404, nie
  403) — zgodnie z tabelą decyzyjną kontraktu §1.1.
- Skrzynka e-maili administracji jest jedynym miejscem podglądu tego, co „wyszłoby" na
  zewnątrz, bez ryzyka rzeczywistej wysyłki.

**Non-Goals:**

- Prawdziwa wysyłka e-mail (SMTP/Mailpit) — status `simulated` jest ostateczny, nie
  przejściowy.
- Preferencje powiadomień, wyciszanie typów, kanały poza dzwonkiem/symulowanym e-mailem.
- Osobna trasa podglądu pojedynczego e-maila — front używa danych już pobranych w liście.

## Decisions

### 404, nie 403, dla cudzego powiadomienia po `id`

`NotificationController@read` skanuje po `user_id = auth()->id()` — brak dopasowania (cudze
albo nieistniejące `id`) zawsze kończy się `ApiException(404, 'not_found', ...)`. Zgodne
z zasadą kontraktu: pojedynczy zasób wskazywany identyfikatorem nie ujawnia istnienia
cudzego rekordu. Test-kit macierzy uprawnień (H02) wprost odnotowuje ten wyjątek od ogólnej
reguły „403 dla naruszenia macierzy ról" — to nie naruszenie macierzy ról, tylko właściwość
pojedynczego zasobu.

### `read-all` rejestrowany przed `{id}/read`

Kolejność tras w `h16.php` ma znaczenie: literalny segment `read-all` musi być zarejestrowany
przed wzorcem `{id}` z ograniczeniem `whereNumber`, inaczej `read-all` zostałby błędnie
dopasowany jako wartość `{id}`.

### `emails.status` ma szersze pole niż faktycznie osiągalny stan

Migracja i model rezerwują `queued | sent | failed | simulated`, ale jedyne miejsce
tworzące wiersze `emails` (`Notify::send`) zawsze zapisuje `simulated` na sztywno. Front
mimo to modeluje wszystkie cztery warianty (etykiety/kolory), co jest świadomym zapasem na
przyszłość (podmiana mocka na prawdziwą wysyłkę po hackathonie), a nie osiągalnym dziś
zachowaniem.

### Dzwonek odpytuje, nie subskrybuje

`NotificationBell` używa pollingu co 30 s zamiast WebSocketów/SSE — zgodne z zakresem
hackathonu (§4 kontraktu nie wymaga powiadomień w czasie rzeczywistym); zmiana liczników
jest optymistyczna po stronie klienta i samo-naprawia się przy kolejnym pollu.

## Risks / Trade-offs

- 9 z 16 typów w rejestrze §3.1 nie ma jeszcze producenta (H03/H08/H09/H15/H17) — to ryzyko
  integracyjne innych pakietów, nie H16; szyna jest gotowa i przetestowana dla dowolnego
  typu (`NotifySendTest` parametryzowany po całym rejestrze).
- Każde wywołanie `Notify::send` tworzy e-mail bezwarunkowo — brak throttlingu/dedupe na
  poziomie szyny; pakiety wysyłające dużo zdarzeń (np. H05 `course.unlocked`) muszą same
  pilnować, by nie wołać `Notify::send` powtórnie dla tego samego zdarzenia (H05 robi to
  przez `SELECT ... FOR UPDATE` + sprawdzenie istniejącego `link`).

## Migration Plan

Brak — kod jest już scalony do `main`, migracja komunikacyjna już zastosowana. Jedynym
efektem tej zmiany jest zsynchronizowanie `openspec/specs/notification-inbox-emails` po
zaakceptowaniu.

## Open Questions

Brak pytań blokujących — zachowanie jest już w produkcji i przetestowane. Ewentualne
podłączenie brakujących typów powiadomień (H03/H08/H09/H15/H17) należy do właścicieli tych
pakietów, nie do tego backfillu.
