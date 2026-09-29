# Realm efemeryczny do proby logowania e2e

`realm-fixture.template.json` jest wywiedziony z kontraktu
(`niepodzielni-konta/docs/INTEGRACJA-KONTRAKT.md`: SS1 stale, SS2 role, SS2b
claim rol, SS2d audiencja, SS3 klienci) - NIE z eksportu realmu produkcyjnego
(`D-35`). Keycloak 26 odrzuca kazde nierozpoznane pole na najwyzszym poziomie
realm-exportu (zmierzone: `Unrecognized field "_uwaga"`), wiec dokumentacja
tego pliku zyje TUTAJ, nie w samym JSON-ie.

Marker kompozytowy `wymaga-2fa` (SS2c kontraktu, role `koordynator` i
`admin-fundacja`) jest SWIADOMIE pominiety w tym realmie: zakres tej proby
logowania cytuje wylacznie SS1, SS2, SS2b, SS2d, SS3 - 2FA nie jest w
zakresie.

Placeholdery podstawiane W BIEGU przez `uruchom-idp.sh` (nigdy na sztywno w
tym pliku, nigdy commitowane z wartoscia):

- `__PSYCHON_API_CLIENT_SECRET__` - sekret klienta poufnego `psychon-api`,
  losowany `openssl rand -hex 32` przy kazdym starcie.
- `__PSYCHON_WEB_ORIGIN__` - adres frontu (`PSYCHON_E2E_WEB_ORIGIN`, domyslnie
  `http://localhost:3000`), do redirect URI klienta `psychon-web`.
- `__NP_E2E_HASLO__` - haslo testowe, losowany sufiks `openssl rand -hex 6`
  doklejony do jawnego, opisowego prefiksu (ten sam wzorzec co
  `niepodzielni-konta/realm/test-fixtures.json`: "Haslo jest jawnym,
  opisowym ciagiem - to NIE jest sekret").

Uzytkownicy testowi (jeden na kazda z 5 rol whitelisty `backend/config/keycloak.php`,
plus jeden swiadek rozjazdu roli):

| username | rola realmu | rola lokalna PsychON |
|---|---|---|
| `e2e-admin-fundacja` | `admin-fundacja` | `super_admin` |
| `e2e-koordynator` | `koordynator` | `project_manager` |
| `e2e-prowadzacy` | `prowadzacy` | `instructor` |
| `e2e-wolontariusz` | `wolontariusz` | `volunteer` |
| `e2e-pacjent` | `pacjent` | `student` |
| `e2e-swiadek-rozjazdu` | `wolontariusz` (w tokenie) | do powiazania w bazie PsychON z `users.role` INNYM niz `volunteer` (np. `student`) - swiadek "rola z tokenu, nie z bazy", kryterium 2 |

`accessTokenLifespan: 8` (sekund) - celowo krotki, zeby kryterium 5
(wygasniecie tokenu w trakcie sesji) bylo mierzalne bez dlugiego czekania w
biegu. Realm produkcyjny ma 600 s (kontrakt SS1) - ta wartosc jest WLASNA dla
tego efemerycznego realmu testowego, nie skopiowana.

## `uruchom-idp.sh`

`bash uruchom-idp.sh start|stop|status` - patrz komentarze w pliku. KAZDE
wywolanie (bo zawiera `docker run`/`docker rm`) idzie PRZEZ `suita.sh`, nigdy
bezposrednio. Kontener dostaje nazwe `psy-e2e-idp-<bieg>` (domyslnie PID+czas,
nadpisywalne `PSYCHON_BIEG_E2E`), wlasny port (poza 55430-55449 - ten zakres
jest zajety przez wspolny kontener bazy bramki zaplecza), `--rm` i bez
nazwanych wolumenow. `stop` zdejmuje WYLACZNIE kontener, ktorego ID zgadza sie
z ID zapisanym przy `start` - nigdy po samej nazwie.

Katalog stanu (`.stan/<bieg>/`, w `.gitignore`) niesie renderowany `realm.json`
(z prawdziwym sekretem/haslem tego biegu), certyfikat TLS wlasny tego biegu i
plik `container.id` - nic z tego nie jest commitowane.
