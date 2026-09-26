import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Odwołania z komentarzy i prób do treści innych plików — kotwice treści,
 * nie numery wierszy.
 *
 * Wada, którą zamyka ta próba: komentarze cytowały pliki po numerze wiersza
 * (w postaci `ścieżka` + dwukropek + numer). Numer przestaje być prawdziwy po
 * każdej zmianie cytowanego pliku, a nic tego nie zgłasza — w chwili
 * zamiany część numerów już wskazywała inny wiersz niż opisany (np. asercje
 * w `IdentityBindingNoElevationNoAutoCreateTest`, trasy wątku w
 * `lib/chat.ts`, warunek zapytania raportu w `ReportView.tsx`).
 *
 * Wzorzec przejęty z `lib/h20/__tests__/audit-actions-source-of-truth.test.ts`:
 * próba czyta cytowany plik jako tekst i czerwienieje, gdy przestaje on
 * zawierać cytowaną treść. Tu uogólniony na rejestr odwołań:
 *
 *   1. każdy wpis `KOTWICE` — cytowany plik zawiera `tresc` (to jest właściwa
 *      kontrola: usunięcie albo zmiana cytowanej treści czerwieni próbę);
 *   2. każdy wpis `KOTWICE` — cytujący plik nadal zawiera tę samą `tresc`
 *      dosłownie (rejestr nie może rozjechać się z komentarzem, którego
 *      pilnuje: przepisany komentarz wymaga przepisania wpisu);
 *   3. zamiatanie — żaden plik źródłowy zaplecza ani frontu nie cytuje już
 *      innego pliku po numerze wiersza (nowe odwołanie tego rodzaju
 *      czerwieni próbę od razu, zanim zdąży się przedawnić).
 *
 * Kotwice we `backend/vendor` (źródło Laravela cytowane przez przyrządy
 * bazy testowej) są osobnym przypadkiem: katalog `vendor` nie jest w
 * repozytorium, a zadanie frontu w CI nie instaluje zależności zaplecza.
 * Dlatego:
 *   - zawsze biegnie kontrola wersji: `backend/composer.lock` musi wskazywać
 *     `laravel/framework` w wersji, przy której kotwice zweryfikowano
 *     (`WERSJA_LARAVEL`) — podbicie frameworka czerwieni próbę i wymusza
 *     ponowne sprawdzenie kotwic, zamiast zostawić je bez nadzoru;
 *   - sama treść jest sprawdzana, gdy `backend/vendor/laravel/framework`
 *     istnieje (lokalny stos po `scripts/setup.sh`); bez niego ta jedna
 *     próba jest jawnie POMINIĘTA w raporcie runnera, nie zielona.
 *
 * Poza rejestrem zostaje jedno odwołanie spoza repozytorium:
 * `VideoTokenService.php` cytuje referencyjny `php/url_signing.php` z
 * repozytorium BunnyWay — już treścią, ale tej treści nie da się tu
 * przeczytać. Zamiatanie (3) pilnuje, żeby nie wrócił tam numer wiersza.
 */

const KORZEN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const LARAVEL = "backend/vendor/laravel/framework/src/Illuminate/";
const WERSJA_LARAVEL = "v13.24.0";

type Kotwica = {
  /** Plik z komentarzem, który cytuje (ścieżka od korzenia repozytorium). */
  cytujacy: string;
  /** Plik cytowany (ścieżka od korzenia repozytorium). */
  cytowany: string;
  /** Dosłowna treść, którą komentarz cytuje i którą cytowany plik ma zawierać. */
  tresc: string;
};

function kotwice(cytujacy: string, cytowany: string, ...tresci: string[]): Kotwica[] {
  return tresci.map((tresc) => ({ cytujacy, cytowany, tresc }));
}

const ROLE_WOLONTARIUSZ = "role:volunteer";
const GRUPA_ZALOGOWANYCH = "Route::middleware('auth:keycloak')->group(";
const GRUPA_AKTYWNYCH = "Route::middleware(['auth:keycloak', 'access.active'])->group(";
const TRASY = "backend/routes/api/";
const MENU = "frontend/lib/menu/participant/";
const KONTRAKT_MENU = "frontend/lib/menu/__tests__/participant-roles-contract.test.ts";
const LEGAL = "frontend/lib/h22/legal-documents.ts";
const SWIADEK_SSO = "backend/tests/Feature/Sso/IdentityBindingNoElevationNoAutoCreateTest.php";

/** Odwołania do plików w repozytorium. */
const KOTWICE: Kotwica[] = [
  // --- zaplecze ---
  ...kotwice(
    "backend/app/Http/Controllers/Api/V1/H22/AdminLegalDocumentController.php",
    "docs/system/03-role-i-uprawnienia.md",
    "Panel: CMS kursów i lekcji",
  ),
  ...kotwice(
    "backend/tests/Feature/H22/AdminLegalDocumentTest.php",
    "docs/system/03-role-i-uprawnienia.md",
    "Panel: CMS kursów i lekcji",
  ),
  ...kotwice(
    "backend/app/Services/H08/SequenceReorderer.php",
    "backend/database/migrations/2026_01_01_000040_create_courses_tables.php",
    "unsignedSmallInteger('sequence_order')->nullable()->index()",
  ),
  ...kotwice(
    "backend/app/Services/H20/ReportSummary.php",
    "backend/app/Support/H13/CertificateConditions.php",
    "$this->conditions = [",
    "'passed_tests_count' => $this->passedTestsCount",
  ),
  // Odwołanie w obrębie jednego pliku: komentarz nad metodą cytuje jej asercje.
  ...kotwice(
    SWIADEK_SSO,
    SWIADEK_SSO,
    "$this->assertSame(0, $attemptedUserInserts",
    "$this->assertSame($before, User::query()->count()",
  ),

  // --- front: ekrany i próby ---
  ...kotwice(
    "frontend/app/(administracja)/admin/certyfikaty/__tests__/admin-certyfikaty-lista.test.tsx",
    `${TRASY}h13.php`,
    "/admin/certificates/{certificate}/revoke",
  ),
  ...kotwice(
    "frontend/app/(uczestnik)/panel/certyfikat/__tests__/panel-certyfikat-liczniki.test.tsx",
    "backend/app/Support/H13/CertificateConditions.php",
    "'done' => $progress['courses_done']",
  ),
  ...kotwice("frontend/app/(uczestnik)/panel/certyfikat/layout.tsx", `${TRASY}h13.php`, ROLE_WOLONTARIUSZ),
  ...kotwice("frontend/app/(uczestnik)/panel/profil-psychologa/layout.tsx", `${TRASY}h15.php`, ROLE_WOLONTARIUSZ),
  ...kotwice("frontend/app/(uczestnik)/panel/staz/layout.tsx", `${TRASY}h11.php`, ROLE_WOLONTARIUSZ),
  ...kotwice("frontend/app/(uczestnik)/panel/superwizja/layout.tsx", `${TRASY}h12.php`, ROLE_WOLONTARIUSZ),
  ...kotwice("frontend/app/(uczestnik)/panel/po-programie/page.tsx", `${TRASY}h01.php`, "Route::get('/me'"),
  ...kotwice("frontend/app/(uczestnik)/panel/po-programie/page.tsx", "backend/config/auth.php", "'driver' => 'keycloak'"),
  ...kotwice(
    "frontend/app/__tests__/admin-uczestniczki-wpiecie.test.tsx",
    "frontend/app/(administracja)/admin/uczestniczki/page.tsx",
    "panel: <AdminUsersList />",
    "panel: <ApplicationsTab />",
  ),
  ...kotwice(
    "frontend/app/dokumenty-prawne/[typ]/__tests__/dokument-prawny.test.tsx",
    `${TRASY}h22.php`,
    "Route::get('/legal-documents/{type}/current'",
  ),
  ...kotwice(
    "frontend/components/document-templates/__tests__/DocumentTemplateTab.test.tsx",
    `${TRASY}document_templates.php`,
    "Route::get('/document-templates/{type}'",
    "Route::put('/document-templates/{type}'",
  ),
  ...kotwice(
    "frontend/components/h09/__tests__/CourseAssignmentPanel.test.tsx",
    "frontend/components/h09/CourseAssignmentPanel.tsx",
    'fullName(row.assignment.instructor) : "—"',
  ),
  ...kotwice(
    "frontend/components/h20/ReportView.tsx",
    "backend/app/Services/H20/ReportSummary.php",
    "whereIn('role', ['volunteer', 'student'])",
  ),
  ...kotwice(
    "frontend/components/layout/HelpWidget.tsx",
    `${TRASY}pomoc.php`,
    "->post('/help-messages'",
    "config('features.help', true)",
  ),
  ...kotwice("frontend/components/layout/__tests__/help-widget-wysylka.test.tsx", `${TRASY}pomoc.php`, "->post('/help-messages'"),
  ...kotwice("frontend/lib/api/help.ts", `${TRASY}pomoc.php`, "->post('/help-messages'"),
  ...kotwice(
    "frontend/components/po-programie/ProgramCompletedCard.tsx",
    `${TRASY}h13.php`,
    "Route::get('/certificate/conditions'",
  ),
  ...kotwice("frontend/components/po-programie/ProgramPendingCard.tsx", `${TRASY}h14.php`, "['auth:keycloak', 'access.active']"),
  ...kotwice("frontend/components/po-programie/ProgramPendingCard.tsx", `${TRASY}h13.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(
    "frontend/lib/api/__tests__/prowadzacy-kursy-adres.test.ts",
    "frontend/components/kursy/__tests__/EdytorTresciKursuProwadzacego.test.tsx",
    "pozytyw: zapis treści przekazuje dane formularza do updateInstructorCourse",
  ),
  ...kotwice(
    "frontend/lib/chat.ts",
    `${TRASY}chat.php`,
    "Route::get('/threads/{thread}'",
    "Route::post('/threads/{thread}/messages'",
  ),
  ...kotwice("frontend/lib/h13/types.ts", `${TRASY}h13.php`, "/admin/certificates/{certificate}/revoke"),
  ...kotwice(
    LEGAL,
    "backend/app/Models/LegalDocumentVersion.php",
    "public const array TYPES = ['regulamin', 'polityka', 'klauzula-rodo'];",
  ),
  ...kotwice(LEGAL, `${TRASY}h22.php`, "Route::get('/legal-documents/{type}/current'"),
  ...kotwice(
    LEGAL,
    "backend/app/Http/Controllers/Api/V1/H22/LegalDocumentController.php",
    "public function current(Request $request, string $type)",
  ),
  ...kotwice(
    LEGAL,
    "backend/app/Http/Resources/H22/PublicLegalDocumentResource.php",
    "'published_at' => $this->published_at?->toIso8601ZuluString()",
  ),
  ...kotwice(
    "frontend/lib/hooks/__tests__/useCloseOnOutsideOrEscape.test.tsx",
    "frontend/lib/hooks/useCloseOnOutsideOrEscape.ts",
    "if (!open) return;",
  ),
  ...kotwice(
    "frontend/lib/menu/instructor/h15-watek-grupowy.ts",
    "backend/app/Http/Controllers/Api/V1/Chat/ThreadController.php",
    "if (in_array('instructor', $roles, true))",
    "$provisioner->ensureGroup($user)",
  ),

  // --- front: menu uczestnika i jego kontrakt ról ---
  ...kotwice(KONTRAKT_MENU, `${TRASY}h01.php`, GRUPA_ZALOGOWANYCH),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h05.php`, GRUPA_AKTYWNYCH),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h11.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h12.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h13.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h14.php`, GRUPA_AKTYWNYCH),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h15.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(KONTRAKT_MENU, `${TRASY}h21.php`, GRUPA_ZALOGOWANYCH, "role:super_admin,project_manager"),
  ...kotwice(`${MENU}h-po-programie.ts`, `${TRASY}h01.php`, GRUPA_ZALOGOWANYCH),
  ...kotwice(`${MENU}h01-profil.ts`, `${TRASY}h01.php`, "Route::get('/me'", "Route::patch('/me'"),
  ...kotwice(`${MENU}h05-kursy.ts`, `${TRASY}h05.php`, "Route::get('/courses'"),
  ...kotwice(`${MENU}h11-staz.ts`, `${TRASY}h11.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(`${MENU}h12-superwizja.ts`, `${TRASY}h12.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(`${MENU}h14-dokumenty.ts`, `${TRASY}h14.php`, "Route::get('/documents'"),
  ...kotwice(`${MENU}h15-profil-psychologa.ts`, `${TRASY}h15.php`, ROLE_WOLONTARIUSZ),
  ...kotwice(`${MENU}h21-start.ts`, `${TRASY}h21.php`, "Route::get('/onboarding'", "role:super_admin,project_manager"),
];

const TESTY_BAZ = `${LARAVEL}Testing/Concerns/TestDatabases.php`;
const RUNNER = `${LARAVEL}Testing/Concerns/RunsInParallel.php`;
const PARALLEL = `${LARAVEL}Testing/ParallelTesting.php`;
const CYKL_ZYCIA = `${LARAVEL}Foundation/Testing/Concerns/InteractsWithTestCaseLifecycle.php`;
const PRZELACZENIE_BAZY = "Arr::hasAny($uses, $databaseTraits)";

/** Odwołania do źródła Laravela w `backend/vendor` (poza repozytorium). */
const KOTWICE_VENDOR: Kotwica[] = [
  ...kotwice("backend/tests/Atrapy/StrazniczaAtrapa.php", CYKL_ZYCIA, "$this->setUpTraits();"),
  ...kotwice("backend/tests/Concerns/AllowedTestDatabases.php", TESTY_BAZ, 'return "{$database}_test_{$token}";'),
  ...kotwice("backend/tests/Concerns/AllowedTestDatabases.php", PARALLEL, "($_SERVER['TEST_TOKEN'] ?? false)"),
  ...kotwice("backend/tests/Concerns/AllowedTestDatabases.php", RUNNER, "Collection::range(1, $processes)"),
  ...kotwice(
    "backend/tests/Concerns/ProcessDatabaseAnnouncement.php",
    RUNNER,
    "ParallelTesting::callSetUpProcessCallbacks();",
    "ParallelTesting::resolveTokenUsing(fn () => $token);",
  ),
  ...kotwice("backend/tests/Concerns/ProcessDatabaseAnnouncement.php", PARALLEL, "public function callSetUpProcessCallbacks()"),
  ...kotwice("backend/tests/Concerns/ProcessDatabaseAnnouncement.php", TESTY_BAZ, "Schema::createDatabase($testDatabase);"),
  ...kotwice(
    "backend/tests/CreatesApplication.php",
    RUNNER,
    "if (trait_exists(\\Tests\\CreatesApplication::class)) {",
    "Application::inferBasePath().'/bootstrap/app.php'",
    "tap($this->createApplication()",
  ),
  ...kotwice(
    "backend/tests/TestCase.php",
    CYKL_ZYCIA,
    "$this->refreshApplication();",
    "ParallelTesting::callSetUpTestCaseCallbacks($this);",
    "$this->setUpTraits();",
  ),
  ...kotwice(
    "backend/tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php",
    TESTY_BAZ,
    "if (Arr::hasAny($uses, $databaseTraits) && ! ParallelTesting::option('without_databases'))",
  ),
  ...kotwice("backend/tests/Feature/Przyrzad/GuardUnderParallelTest.php", RUNNER, "ParallelTesting::resolveTokenUsing(fn () => $token);"),
  ...kotwice("backend/tests/Unit/Przyrzad/AllowedTestDatabasesTest.php", PARALLEL, "($_SERVER['TEST_TOKEN'] ?? false)"),
  ...[
    "backend/tests/Feature/ExampleTest.php",
    "backend/tests/Feature/H03/PublicRegistrationTest.php",
    "backend/tests/Feature/H08/ConcurrentLessonOrderTest.php",
    "backend/tests/Feature/H10/ConcurrentAttemptNumberingTest.php",
    "backend/tests/Feature/H10/ConcurrentQuestionOrderTest.php",
    "backend/tests/Feature/H10/FirstAttemptRaceTest.php",
    "backend/tests/Feature/H13/EmptyEditionConcurrentCertificateTest.php",
    "backend/tests/Feature/H14/ConcurrentDocumentNumberTest.php",
    "backend/tests/Feature/Przyrzad/GuardBehaviourTest.php",
    "backend/tests/Feature/Przyrzad/GuardUnderParallelTest.php",
    "backend/tests/Feature/Przyrzad/TestDatabaseIsolationTest.php",
    "backend/tests/Feature/PublicRoutesSmokeTest.php",
    "backend/tests/Unit/H22/LegalDocumentVersionTypesTest.php",
  ].flatMap((plik) => kotwice(plik, TESTY_BAZ, PRZELACZENIE_BAZY)),
];

/**
 * Zamiatane katalogi. Dokumentacja (`docs/`, `DEMO/`, archiwum `openspec/`)
 * świadomie poza zakresem — to zapis historyczny, nie komentarz przy kodzie.
 */
const ZAMIATANE = [
  "backend/app",
  "backend/bootstrap",
  "backend/config",
  "backend/database",
  "backend/routes",
  "backend/tests",
  "frontend/__tests__",
  "frontend/app",
  "frontend/components",
  "frontend/e2e",
  "frontend/lib",
  "frontend/scripts",
];
const ROZSZERZENIA = /\.(php|ts|tsx|js|mjs)$/;
const POMIJANE_KATALOGI = new Set(["node_modules", ".next", "vendor"]);

/**
 * Odwołanie po numerze wiersza: nazwa pliku z rozszerzeniem, dwukropek,
 * liczba (`plik.php` + `:` + liczba, także za zamykającym odwróconym
 * apostrofem), albo skrót samego numeru w odwróconych apostrofach
 * (odwrócony apostrof + `:` + liczba), którym komentarze odsyłały do
 * „tego samego pliku, co wyżej".
 */
const NUMER_WIERSZA = [
  /[\w\-.]+\.(?:php|tsx?|mjs|js|md|json|ya?ml|sh|css)`?:\d+/g,
  /`:\d+(?:[-,]\d+)*`/g,
];

function czytaj(wzgledna: string): string {
  return readFileSync(path.join(KORZEN, wzgledna), "utf-8");
}

function pliki(katalog: string): string[] {
  const pelny = path.join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny, { withFileTypes: true }).flatMap((wpis) => {
    if (POMIJANE_KATALOGI.has(wpis.name)) return [];
    const wzgledna = path.posix.join(katalog, wpis.name);
    if (wpis.isDirectory()) return pliki(wzgledna);
    return ROZSZERZENIA.test(wpis.name) ? [wzgledna] : [];
  });
}

function wystapienia(tresc: string, szukane: string): number {
  return tresc.split(szukane).length - 1;
}

/** Wpisy, których cytowany plik nie zawiera cytowanej treści. */
function brakujaceKotwice(rejestr: Kotwica[]): string[] {
  return rejestr
    .filter(({ cytujacy, cytowany, tresc }) => {
      const zawartosc = czytaj(cytowany);
      // Odwołanie w obrębie jednego pliku: sam komentarz zawiera kotwicę,
      // więc treść musi wystąpić co najmniej jeszcze raz — w kodzie.
      const wymagane = cytujacy === cytowany ? 2 : 1;
      return wystapienia(zawartosc, tresc) < wymagane;
    })
    .map(({ cytujacy, cytowany, tresc }) => `${cytowany} nie zawiera ${JSON.stringify(tresc)} (cytuje: ${cytujacy})`);
}

/** Wpisy, których komentarz w pliku cytującym już nie przytacza treści. */
function nieaktualneWpisy(rejestr: Kotwica[]): string[] {
  return rejestr
    .filter(({ cytujacy, tresc }) => !czytaj(cytujacy).includes(tresc))
    .map(({ cytujacy, tresc }) => `${cytujacy} nie przytacza ${JSON.stringify(tresc)}`);
}

const vendorObecny = existsSync(path.join(KORZEN, LARAVEL));

describe("odwołania do treści innych plików — kotwice treści, nie numery wierszy", () => {
  it("rejestr nie jest pusty (kontrola, że próba czyta właściwe drzewo)", () => {
    expect(KOTWICE.length).toBeGreaterThan(0);
    expect(KOTWICE_VENDOR.length).toBeGreaterThan(0);
    expect(pliki("backend/app").length).toBeGreaterThan(0);
    expect(pliki("frontend/lib").length).toBeGreaterThan(0);
  });

  it("każdy cytowany plik w repozytorium zawiera cytowaną treść", () => {
    expect(brakujaceKotwice(KOTWICE)).toEqual([]);
  });

  it("każdy komentarz z rejestru nadal przytacza swoją kotwicę dosłownie", () => {
    expect(nieaktualneWpisy([...KOTWICE, ...KOTWICE_VENDOR])).toEqual([]);
  });

  it(`composer.lock przypina laravel/framework ${WERSJA_LARAVEL} — wersję, przy której zweryfikowano kotwice w vendor`, () => {
    const blok = czytaj("backend/composer.lock").match(
      /"name": "laravel\/framework",\s*"version": "([^"]+)"/,
    );
    expect(blok, "nie znaleziono laravel/framework w backend/composer.lock").not.toBeNull();
    expect(
      blok?.[1],
      "podbito laravel/framework — sprawdź kotwice KOTWICE_VENDOR w nowym źródle i zaktualizuj WERSJA_LARAVEL",
    ).toBe(WERSJA_LARAVEL);
  });

  it.skipIf(!vendorObecny)("każdy cytowany plik Laravela w backend/vendor zawiera cytowaną treść", () => {
    expect(brakujaceKotwice(KOTWICE_VENDOR)).toEqual([]);
  });

  it("żaden plik źródłowy zaplecza ani frontu nie cytuje innego pliku po numerze wiersza", () => {
    const naruszenia = ZAMIATANE.flatMap(pliki).flatMap((plik) =>
      czytaj(plik)
        .split("\n")
        .flatMap((linia, i) =>
          NUMER_WIERSZA.flatMap((wzor) => linia.match(wzor) ?? []).map(
            (trafienie) => `${plik} (linia ${i + 1}): ${trafienie}`,
          ),
        ),
    );
    expect(naruszenia).toEqual([]);
  });
});
