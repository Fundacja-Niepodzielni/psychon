# Dryf między kontraktem HTTP a trasami w kodzie

Notatka pomiarowa. Wygenerowano **2026-09-24** na gałęzi bazowej `sprint-2`
(`4943e0794e35eb60280ea2f7b218b34539f25ec5`). Porównanie dotyczy wyłącznie par
**metoda + ścieżka** pod `/api/v1`: po jednej stronie `php artisan route:list`, po drugiej
każda wzmianka `` `METODA /ścieżka` `` w `docs/hackathon/02-kontrakt-api.md`.
Kontrakt ani trasy nie zostały zmienione.

## 1 · Wynik

| Wielkość | Liczba | Skąd |
|---|---|---|
| Trasy w kodzie (metoda + ścieżka, `HEAD` pominięte jako bliźniak `GET`) | 137 | `route:list --json --path=api`, skrypt z §5 (`code=`) |
| Trasy w kontrakcie (unikalne pary metoda + ścieżka) | 68 | skrypt z §5 (`contract=`) |
| Lista A — w kodzie, brak w kontrakcie | 74 | skrypt z §5 (`only_code=`) |
| Lista B — w kontrakcie, brak w kodzie | 5 | skrypt z §5 (`only_contract=`) |
| Lista C — w obu, różna metoda, grupa middleware albo nazwa parametru | 6 | skrypt z §5 (`both_diff=`, `method_diff_paths=0`) |
| Lista D — w obu, zgodne | 57 | skrypt z §5 (`both_same=`) |

Bilans: kod **137 = 74 (A) + 6 (C) + 57 (D)**; kontrakt **68 = 5 (B) + 6 (C) + 57 (D)**.
Kontrakt zawiera 79 wzmianek `` `METODA /ścieżka` ``: 5 pominiętych (§4), 6 powtórzeń tej
samej pary, 68 unikalnych (**79 = 5 + 6 + 68**).

Surowy wynik skryptu (dwa pierwsze wiersze):

```text
contract_mentions=79 skipped=5 duplicates=6
code=137 contract=68 only_code=74 only_contract=5 both_diff=6 both_same=57 method_diff_paths=0
```

## 2 · Polecenia

Wykonane w piaskownicy bez Dockera, PostgreSQL i Redisa (PHP 8.4.19, Composer 2.8.12).

```bash
cd backend
composer install --no-interaction          # nie przeszło — patrz niżej
composer install --no-interaction --prefer-source --no-dev
cp .env.example .env                       # .env jest w .gitignore, nie trafia do repo
php artisan key:generate
php artisan route:list --json --path=api > /tmp/routes.json
php artisan route:list --path=api | tail -1   # "Showing [137] routes"
cd ..
python3 /tmp/drift.py /tmp/routes.json docs/hackathon/02-kontrakt-api.md
```

- `composer install --no-interaction` kończy się błędem
  `Could not authenticate against github.com` (`[403]` na pobraniu archiwum dystrybucyjnego
  pakietu `phpstan/phpstan` z GitHub). W `composer.lock` jedynym pakietem
  bez źródła git jest `phpstan/phpstan` (wyłącznie `require-dev`). Pozostałe pakiety
  instalują się z git (`--prefer-source`), a `route:list` nie potrzebuje pakietów
  deweloperskich — stąd `--no-dev`. `composer.json` i `composer.lock` bez zmian.
- `route:list` **nie wymagał połączenia z bazą** — ustawienie `DB_CONNECTION=sqlite` nie
  było potrzebne.
- Trasy pakietów są za flagami `config('features.hXX')`. Wszystkie 22 flagi w
  `backend/config/features.php` są wpisane na sztywno jako `true` (nie czytają `.env`),
  flaga `features.chat` ma domyślnie `true` — lista 137 tras jest więc pełna.

## 3 · Listy

### Lista A — w kodzie, brak w kontrakcie (74)

| Metoda | Ścieżka | Middleware |
|---|---|---|
| `GET` | `/admin/applications` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/applications` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/applications/{id}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/applications/{id}/diploma-scan` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/certificates` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/certificates/{certificate}/revoke` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/courses` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/courses/reorder` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses/reorder/preview` | `api,auth:keycloak,role:project_manager,super_admin` |
| `DELETE` | `/admin/courses/{course}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/courses/{course}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/courses/{course}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `DELETE` | `/admin/courses/{course}/assignments` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/courses/{course}/assignments` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses/{course}/assignments` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses/{course}/invite` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/courses/{course}/lessons` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses/{course}/lessons` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/courses/{course}/lessons/reorder` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses/{course}/materials` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/courses/{course}/tests` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/courses/{course}/tests` | `api,auth:keycloak,role:project_manager,super_admin` |
| `DELETE` | `/admin/lessons/{lesson}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/lessons/{lesson}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/lessons/{lesson}/materials` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/lessons/{lesson}/video-status` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/lessons/{lesson}/video-uploads` | `api,auth:keycloak,role:super_admin` |
| `DELETE` | `/admin/materials/{material}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/onboarding` | `api,auth:keycloak,role:super_admin,project_manager` |
| `GET` | `/admin/profiles` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/profiles/{id}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/profiles/{id}/accept` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/profiles/{id}/return` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/profiles/{profileId}/documents/{docId}` | `api,auth:keycloak,role:project_manager,super_admin,signed` |
| `DELETE` | `/admin/questions/{question}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/questions/{question}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/supervision/cases` | `api,auth:keycloak,role:project_manager,super_admin` |
| `PATCH` | `/admin/tests/{test}` | `api,auth:keycloak,role:project_manager,super_admin` |
| `GET` | `/admin/tests/{test}/questions` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/tests/{test}/questions` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/users/{id}/anonymize` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/admin/users/{id}/extend-access` | `api,auth:keycloak,role:project_manager,super_admin` |
| `POST` | `/applications/first-login` | `api,App\Http\Middleware\AuthenticateKeycloakToken,throttle:6,1` |
| `GET` | `/certificate/download` | `api,auth:keycloak,access.active,role:volunteer` |
| `GET` | `/documents` | `api,auth:keycloak,access.active` |
| `POST` | `/documents/generate` | `api,auth:keycloak,access.active` |
| `GET` | `/documents/{document:public_id}/download` | `api,auth:keycloak,access.active,signed` |
| `POST` | `/instructor/cases` | `api,auth:keycloak,role:instructor` |
| `GET` | `/instructor/courses` | `api,auth:keycloak,role:instructor` |
| `GET` | `/instructor/questions` | `api,auth:keycloak,role:instructor` |
| `POST` | `/instructor/questions/{id}/answer` | `api,auth:keycloak,role:instructor` |
| `GET` | `/instructors` | `api,auth:keycloak,access.active` |
| `GET` | `/instructors/{id}` | `api,auth:keycloak,access.active` |
| `GET` | `/lessons/{id}/questions` | `api,auth:keycloak,access.active,role:volunteer,student` |
| `POST` | `/lessons/{id}/questions` | `api,auth:keycloak,access.active,role:volunteer,student` |
| `GET` | `/lessons/{lesson}/video-link` | `api,auth:keycloak,access.active` |
| `GET` | `/materials/{material}/download` | `api,signed` |
| `GET` | `/me/instructor-profile` | `api,auth:keycloak,role:instructor` |
| `PATCH` | `/me/instructor-profile` | `api,auth:keycloak,role:instructor` |
| `GET` | `/onboarding` | `api,auth:keycloak` |
| `GET` | `/psychologist-profile` | `api,auth:keycloak,access.active,role:volunteer` |
| `PATCH` | `/psychologist-profile` | `api,auth:keycloak,access.active,role:volunteer` |
| `POST` | `/psychologist-profile/consent/withdraw` | `api,auth:keycloak,access.active,role:volunteer` |
| `POST` | `/psychologist-profile/documents` | `api,auth:keycloak,access.active,role:volunteer` |
| `POST` | `/psychologist-profile/submit` | `api,auth:keycloak,access.active,role:volunteer` |
| `POST` | `/sso/potwierdzenie-aktywacji` | `api,auth:keycloak` |
| `POST` | `/sso/powiaz` | `api,App\Http\Middleware\AuthenticateKeycloakToken,throttle:6,1` |
| `GET` | `/sso/whoami` | `api,App\Http\Middleware\AuthenticateKeycloakToken` |
| `GET` | `/tests/{test}/attempts` | `api,auth:keycloak,access.active,role:volunteer,student` |
| `GET` | `/threads` | `api,auth:keycloak,access.active` |
| `GET` | `/threads/{thread}` | `api,auth:keycloak,access.active` |
| `POST` | `/threads/{thread}/messages` | `api,auth:keycloak,access.active` |
| `GET` | `/verify/qr/{token}` | `api` |

### Lista B — w kontrakcie, brak w kodzie (5)

| Metoda | Ścieżka | Wiersz kontraktu |
|---|---|---|
| `POST` | `/auth/login` | 15 |
| `POST` | `/auth/logout` | 15 |
| `POST` | `/auth/forgot-password` | 16 |
| `POST` | `/auth/reset-password` | 17 |
| `POST` | `/auth/activate` | 17 |

Wszystkie pięć to trasy uwierzytelnienia z §1 kontraktu („Uwierzytelnienie", wiersze
14–17: `Authorization: Bearer <token>` (Sanctum)). W kodzie trasy chronione są strażnikiem
`auth:keycloak`, a pierwsze powiązanie konta obsługują trasy `/sso/*` z listy A.

### Lista C — w obu, różnica (6)

Różnica metody: **0** (żadna ścieżka nie występuje po obu stronach wyłącznie z różną
metodą). Różnice nazwy parametru: 5. Różnice middleware: 1.

| Metoda | Ścieżka w kontrakcie | Ścieżka w kodzie | Różnica | Kontrakt: dostęp | Kod: dostęp | Wiersz kontraktu |
|---|---|---|---|---|---|---|
| `GET` | `/me/exports/{id}` | `/me/exports/{export}` | parametr | token, role: nieokreślone | token, role: dowolna | 91 |
| `GET` | `/me/exports/{id}/download` | `/me/exports/{export}/download` | parametr | token, role: nieokreślone | token, role: dowolna | 91 |
| `POST` | `/tests/{id}/attempts` | `/tests/{test}/attempts` | parametr | token, role: nieokreślone | token, role: student, volunteer | 285 |
| `POST` | `/admin/tests/{testId}/users/{userId}/reset-attempts` | `/admin/tests/{test}/users/{user}/reset-attempts` | parametr | token, role: project_manager, super_admin | token, role: project_manager, super_admin | 295 |
| `POST` | `/admin/workshop/{userId}/complete` | `/admin/workshop/{user}/complete` | parametr | token, role: project_manager, super_admin | token, role: project_manager, super_admin | 296 |
| `PATCH` | `/instructor/slots/{id}/attendance` | `/instructor/slots/{id}/attendance` | role | token, role: instructor, project_manager, super_admin | token, role: instructor | 380 |

Wiersz ostatni: kontrakt w wierszu 391 mówi „dostęp: prowadzący **oraz administracja**
(`project_manager`, `super_admin`)", a trasa ma middleware `role:instructor`.

### Lista D — w obu, zgodne (57)

| Metoda | Ścieżka | Wiersz kontraktu |
|---|---|---|
| `POST` | `/admin/applications/{id}/accept` | 20 |
| `GET` | `/me` | 77 |
| `PATCH` | `/me` | 88 |
| `PATCH` | `/admin/users/{id}` | 89 |
| `POST` | `/me/exports` | 90 |
| `GET` | `/courses` | 97 |
| `GET` | `/courses/{slug}` | 110 |
| `GET` | `/lessons/{id}` | 127 |
| `POST` | `/lessons/{id}/progress` | 147 |
| `POST` | `/lessons/{id}/complete` | 161 |
| `GET` | `/admin/reliability` | 184 |
| `GET` | `/admin/reliability/{userId}` | 209 |
| `GET` | `/instructor/reliability` | 244 |
| `GET` | `/courses/{slug}/test` | 274 |
| `GET` | `/internship/entries` | 331 |
| `POST` | `/internship/entries` | 336 |
| `PATCH` | `/internship/entries/{id}` | 340 |
| `GET` | `/admin/internship/pending` | 347 |
| `POST` | `/admin/internship/{id}/accept` | 360 |
| `POST` | `/admin/internship/{id}/return` | 362 |
| `POST` | `/supervision/slots/{id}/signup` | 378 |
| `PUT` | `/admin/users/{id}/supervisor` | 382 |
| `GET` | `/admin/supervision/slots` | 383 |
| `GET` | `/supervision/slots` | 385 |
| `DELETE` | `/supervision/slots/{id}/signup` | 387 |
| `GET` | `/instructor/group` | 389 |
| `POST` | `/instructor/slots` | 390 |
| `GET` | `/certificate/conditions` | 399 |
| `POST` | `/certificate/generate` | 410 |
| `GET` | `/verify/{number}` | 413 |
| `GET` | `/notifications` | 421 |
| `POST` | `/notifications/{id}/read` | 424 |
| `POST` | `/notifications/read-all` | 424 |
| `GET` | `/admin/emails` | 425 |
| `POST` | `/admin/applications/{id}/reject` | 433 |
| `POST` | `/admin/applications/import` | 436 |
| `GET` | `/admin/users` | 442 |
| `GET` | `/admin/users/{id}` | 443 |
| `POST` | `/admin/users` | 453 |
| `POST` | `/admin/users/{id}/block` | 454 |
| `GET` | `/admin/users/export.csv` | 454 |
| `GET` | `/admin/edition` | 458 |
| `PATCH` | `/admin/edition` | 459 |
| `GET` | `/admin/dashboard` | 460 |
| `GET` | `/admin/report` | 466 |
| `GET` | `/admin/report/export.csv` | 466 |
| `GET` | `/admin/audit` | 467 |
| `GET` | `/admin/audit/export.csv` | 467 |
| `GET` | `/legal-documents/{type}/current` | 480 |
| `GET` | `/legal-documents/{type}/versions/{version}` | 482 |
| `POST` | `/legal-documents/{type}/accept` | 494 |
| `GET` | `/admin/legal-documents/{type}/versions` | 532 |
| `POST` | `/admin/legal-documents/{type}/versions` | 534 |
| `PATCH` | `/admin/legal-documents/{type}/versions/{version}` | 538 |
| `DELETE` | `/admin/legal-documents/{type}/versions/{version}` | 541 |
| `POST` | `/admin/legal-documents/{type}/versions/{version}/publish` | 543 |
| `POST` | `/admin/internship/{id}/reject` | 647 |

## 4 · Reguły porównania

- **Klucz pary:** metoda + ścieżka z parametrami sprowadzonymi do `{}`; `GET|HEAD` liczone
  jako jedno `GET`. Nazwy parametrów porównywane osobno, pozycyjnie
  (`{document:public_id}` liczone jako nazwa `document:public_id`).
- **Wyodrębnianie z kontraktu:** wyrażenie `` `(GET|POST|PATCH|PUT|DELETE) /ścieżka ``,
  z odciętym query stringiem. Pominięte wzmianki (5), bo nie deklarują trasy:
  - w. 21 — `PATCH .../attendance`, `PATCH .../reorder`: przykłady reguły nazewnictwa
    z wyciętą ścieżką;
  - w. 65 — `GET .../export.csv`: ogólna reguła eksportów CSV;
  - w. 300 — `GET /internship/entries/{id}`: kontrakt stwierdza, że ta trasa **nie** istnieje;
  - w. 509 — `GET /legal-documents/klauzula-rodo/current`: konkretny przypadek
    `GET /legal-documents/{type}/current`.
- **Rozwinięta wzmianka (1):** w. 433 `POST .../reject` w sekcji „Rekrutacja (H03)" →
  `POST /admin/applications/{id}/reject`.
- **Grupa middleware** porównywana tylko tam, gdzie kontrakt ją określa:
  - dostęp publiczny (bez tokenu): `/auth/login`, `/auth/forgot-password`,
    `/auth/reset-password`, `/auth/activate`, `/verify/{number}`,
    `/legal-documents/{type}/current`, `/legal-documents/{type}/versions/{version}`;
    każda inna trasa kontraktu wymaga tokenu. W kodzie „token" = middleware `auth:*` albo
    `AuthenticateKeycloakToken`;
  - role: `/admin/*` → `project_manager`, `super_admin` („administracja", w. 391);
    `/instructor/*` → `instructor`; wyjątek `PATCH /instructor/slots/{id}/attendance` →
    `instructor`, `project_manager`, `super_admin` (w. 391). Dla pozostałych tras kontrakt
    nie określa ról — porównywany jest tylko wymóg tokenu;
  - nieporównywane: `access.active`, `throttle:*`, `signed` (kontrakt ich nie wymienia)
    oraz rodzaj strażnika (`Sanctum` w kontrakcie, `auth:keycloak` w kodzie) — ta różnica
    dotyczy wszystkich tras naraz i jest opisana przy liście B.

## 5 · Skrypt porównujący

Zapisz jako `/tmp/drift.py` (poza repozytorium) i uruchom poleceniem z §2.

```python
#!/usr/bin/env python3
# Usage: python3 drift.py routes.json docs/hackathon/02-kontrakt-api.md
import json, re, sys

ADMIN = {"project_manager", "super_admin"}
routes_path, contract_path = sys.argv[1], sys.argv[2]

# --- code side -------------------------------------------------------------
code = []
for r in json.load(open(routes_path)):
    mw = r["middleware"] if isinstance(r["middleware"], list) else [r["middleware"]]
    authed = any(m.startswith("auth:") or m.endswith("AuthenticateKeycloakToken") for m in mw)
    roles = set()
    for m in mw:
        if m.startswith("role:"):
            roles |= set(m[5:].split(","))
    for method in r["method"].split("|"):
        if method == "HEAD":
            continue
        code.append({"method": method, "path": "/" + r["uri"].removeprefix("api/v1/"),
                     "mw": ",".join(mw), "public": not authed, "roles": roles or None})

# --- contract side ---------------------------------------------------------
# Mentions that are not route declarations (line number -> reason).
SKIP_LINES = {21: "naming-rule example with elided path",
              65: "generic CSV rule with elided path",
              300: "route declared as non-existent",
              509: "concrete instance of /legal-documents/{type}/current"}
# Elided paths resolved from the surrounding section.
RESOLVE = {433: "/admin/applications/{id}/reject"}
PUBLIC = {"/auth/login", "/auth/forgot-password", "/auth/reset-password", "/auth/activate",
          "/verify/{number}", "/legal-documents/{type}/current",
          "/legal-documents/{type}/versions/{version}"}
ROLES = {("PATCH", "/instructor/slots/{id}/attendance"): {"instructor"} | ADMIN}

pat = re.compile(r"`(GET|POST|PATCH|PUT|DELETE) ([/.][^\s`?]*)")
contract, seen, mentions, skipped, dupes = [], set(), 0, 0, 0
for no, line in enumerate(open(contract_path, encoding="utf-8"), 1):
    found = pat.findall(line)
    mentions += len(found)
    if no in SKIP_LINES:
        skipped += len(found)
        continue
    for method, path in found:
        if path.startswith("..."):
            path = RESOLVE[no]
        if (method, path) in seen:
            dupes += 1
            continue
        seen.add((method, path))
        roles = ROLES.get((method, path))
        if roles is None and path.startswith("/admin/"):
            roles = ADMIN
        if roles is None and path.startswith("/instructor/"):
            roles = {"instructor"}
        contract.append({"method": method, "path": path, "line": no,
                         "public": path in PUBLIC, "roles": roles})

# --- comparison ------------------------------------------------------------
norm = lambda p: re.sub(r"\{[^}]+\}", "{}", p)
params = lambda p: re.findall(r"\{([^}]+)\}", p)
code_by_key = {(c["method"], norm(c["path"])): c for c in code}
contract_by_key = {(k["method"], norm(k["path"])): k for k in contract}

assert len(code_by_key) == len(code) and len(contract_by_key) == len(contract)
only_code = [c for key, c in code_by_key.items() if key not in contract_by_key]
only_contract = [k for key, k in contract_by_key.items() if key not in code_by_key]
# A path present on both sides under different methods is a method mismatch.
paths_oc = {norm(c["path"]) for c in only_code}
paths_ok = {norm(k["path"]) for k in only_contract}
method_diff = sorted(paths_oc & paths_ok)

diff, same = [], []
for key, k in contract_by_key.items():
    c = code_by_key.get(key)
    if not c:
        continue
    why = []
    if params(k["path"]) != params(c["path"]):
        why.append("parametr")
    if k["public"] != c["public"]:
        why.append("dostęp publiczny/token")
    if k["roles"] is not None and c["roles"] != k["roles"]:
        why.append("role")
    (diff if why else same).append((k, c, why))

fmt_roles = lambda r: ", ".join(sorted(r)) if r else "dowolna"
print(f"contract_mentions={mentions} skipped={skipped} duplicates={dupes}")
print(f"code={len(code)} contract={len(contract)} only_code={len(only_code)} "
      f"only_contract={len(only_contract)} both_diff={len(diff)} both_same={len(same)} "
      f"method_diff_paths={len(method_diff)}")
print("\n## ONLY_CODE")
for c in sorted(only_code, key=lambda c: (c["path"], c["method"])):
    print(f"| `{c['method']}` | `{c['path']}` | `{c['mw']}` |")
print("\n## ONLY_CONTRACT")
for k in sorted(only_contract, key=lambda k: k["line"]):
    print(f"| `{k['method']}` | `{k['path']}` | {k['line']} |")
print("\n## METHOD_DIFF")
for p in method_diff:
    print(p)
print("\n## BOTH_DIFF")
for k, c, why in diff:
    print(f"| `{k['method']}` | `{k['path']}` | `{c['path']}` | {'; '.join(why)} | "
          f"{'publiczna' if k['public'] else 'token'}, role: {fmt_roles(k['roles']) if k['roles'] is not None else 'nieokreślone'} | "
          f"{'publiczna' if c['public'] else 'token'}, role: {fmt_roles(c['roles'])} | {k['line']} |")
print("\n## BOTH_SAME")
for k, c, why in sorted(same, key=lambda t: t[0]["line"]):
    print(f"| `{k['method']}` | `{k['path']}` | {k['line']} |")
```

## 6 · Czego nie zmierzono

- Kształtu odpowiedzi, kodów statusu i walidacji — porównanie obejmuje tylko trasy.
- Wzmianek w kontrakcie bez pary metoda + ścieżka (opisy prozą). Część tras z listy A
  ma w kontrakcie wyłącznie taki opis, np. skan dyplomu (w. 438), `access.extended` (w. 588),
  `user.anonymized` (w. 688); unieważnianie certyfikatów i anonimizacja RODO są w §4
  kontraktu („Czego nie robimy na hackathonie", w. 627–628) mimo tras w kodzie.
- Autoryzacji wewnątrz kontrolerów i polityk — porównywane jest tylko middleware tras.
- Testów Feature — wymagają PostgreSQL i Redisa, niedostępnych w tej piaskownicy.
