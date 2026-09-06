<?php

namespace Tests\Feature\PermissionMatrix;

use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H02 · Matryca uprawnień — test-kit wielokrotnego użytku.
 *
 * `matrixRows()` jest JEDNĄ tabelą w kodzie (docs/system/03-role-i-uprawnienia.md
 * §2) — dopisanie nowej trasy do pokrycia to jeden nowy wiersz, nic więcej.
 * Pokrywa trasy P0 istniejące dziś w kodzie: H01 (`/me`, `/me/exports`) i
 * H16 (`/notifications`, `/admin/emails`). Kolejne pakiety P0 (H05, H06, H10,
 * H21…) dopisują swoje wiersze, gdy ich trasy wylądują na `main`.
 *
 * `matrix_5a`–`matrix_5f` odpowiadają wymaganym testom z
 * docs/system/03-role-i-uprawnienia.md §5. (d) i (e) czekały wcześniej na
 * H04 i H12 — oba pakiety są scalone, więc oba wiersze są egzekwowane.
 */
class PermissionMatrixTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const array ROLES = ['volunteer', 'student', 'instructor', 'project_manager', 'super_admin'];

    private const array ADMIN_ONLY_ROLES = ['project_manager', 'super_admin'];

    /**
     * Wiersze matrycy: [rola|null (gość), metoda, uri, oczekiwany status,
     * opcjonalnie body / own (zasób tworzony dla wykonawcy przed żądaniem)].
     */
    public static function matrixRows(): array
    {
        $rows = [];

        foreach (self::ROLES as $role) {
            $adminExpect = in_array($role, self::ADMIN_ONLY_ROLES, true) ? 200 : 403;

            $rows["GET /me — {$role}"] = [['role' => $role, 'method' => 'GET', 'uri' => '/api/v1/me', 'expect' => 200]];
            $rows["PATCH /me — {$role}"] = [['role' => $role, 'method' => 'PATCH', 'uri' => '/api/v1/me', 'body' => [], 'expect' => 200]];
            $rows["POST /me/exports — {$role}"] = [['role' => $role, 'method' => 'POST', 'uri' => '/api/v1/me/exports', 'expect' => 202]];
            $rows["GET /me/exports/{id} (own) — {$role}"] = [['role' => $role, 'method' => 'GET', 'uri' => '/api/v1/me/exports/{id}', 'own' => 'export', 'expect' => 200]];
            $rows["GET /notifications — {$role}"] = [['role' => $role, 'method' => 'GET', 'uri' => '/api/v1/notifications', 'expect' => 200]];
            $rows["POST /notifications/read-all — {$role}"] = [['role' => $role, 'method' => 'POST', 'uri' => '/api/v1/notifications/read-all', 'expect' => 200]];
            $rows["POST /notifications/{id}/read (own) — {$role}"] = [['role' => $role, 'method' => 'POST', 'uri' => '/api/v1/notifications/{id}/read', 'own' => 'notification', 'expect' => 200]];
            $rows["GET /admin/emails — {$role}"] = [['role' => $role, 'method' => 'GET', 'uri' => '/api/v1/admin/emails', 'expect' => $adminExpect]];
        }

        // Gość (brak tokenu) — każda z powyższych tras wymaga uwierzytelnienia (§1.1: 401 unauthenticated).
        foreach ([
            ['GET', '/api/v1/me'],
            ['PATCH', '/api/v1/me'],
            ['POST', '/api/v1/me/exports'],
            ['GET', '/api/v1/notifications'],
            ['POST', '/api/v1/notifications/read-all'],
            ['GET', '/api/v1/admin/emails'],
        ] as [$method, $uri]) {
            $rows["{$method} {$uri} — gość"] = [['role' => null, 'method' => $method, 'uri' => $uri, 'expect' => 401]];
        }

        return $rows;
    }

    #[DataProvider('matrixRows')]
    public function test_matrix_row(array $row): void
    {
        $role = $row['role'];
        $method = $row['method'];
        $uri = $row['uri'];
        $expect = $row['expect'];
        $body = $row['body'] ?? [];
        $own = $row['own'] ?? null;

        $user = $role !== null ? $this->actingAsRole($role) : null;

        if ($own === 'export' && $user !== null) {
            $exportId = $this->postJson('/api/v1/me/exports')->json('data.id');
            $uri = str_replace('{id}', (string) $exportId, $uri);
        } elseif ($own === 'notification' && $user !== null) {
            $notification = Notify::send($user, 'course.unlocked', 'Test', 'Treść testowa.', '/panel');
            $uri = str_replace('{id}', (string) $notification->id, $uri);
        }

        $response = $this->json($method, $uri, $body);

        $response->assertStatus($expect);

        if ($expect === 403) {
            $response->assertJsonPath('error.code', 'forbidden');
        } elseif ($expect === 401) {
            $response->assertJsonPath('error.code', 'unauthenticated');
        }
    }

    /**
     * §5(a) — dostęp do własnych zasobów działa.
     */
    #[Test]
    public function matrix_5a(): void
    {
        $volunteer = $this->actingAsRole('volunteer');

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.email', $volunteer->email);

        $this->getJson('/api/v1/notifications')->assertOk();
    }

    /**
     * §5(b) — dostęp do cudzych zwraca 403 (opis systemowy). Kontrakt API
     * (hackathon §1.1, rozstrzyga kształt HTTP) mówi jednak: pojedynczy cudzy
     * zasób wskazany identyfikatorem → 404 (nie ujawniamy istnienia). Trasy
     * sekcji/panelu (prawdziwe 403) pokrywa matrix_5c.
     */
    #[Test]
    public function matrix_5b(): void
    {
        $owner = $this->actingAsRole('volunteer');
        $notification = Notify::send($owner, 'course.unlocked', 'Tytuł', 'Treść.', '/panel');

        $this->actingAsRole('volunteer'); // ktoś inny, ta sama rola

        $this->postJson("/api/v1/notifications/{$notification->id}/read")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * §5(c) — trasy panelu zwracają 403 dla ról nieadministracyjnych.
     * Pokrywa też kryterium ★2 pakietu H02.
     */
    #[Test]
    public function matrix_5c(): void
    {
        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAsRole($role);

            $this->getJson('/api/v1/admin/emails')
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    /**
     * §5(d) — wygaśnięcie dostępu blokuje treści programu (403
     * `access_expired`), ale nie logowanie ani eksport RODO. Pełną listę tras
     * bramkowanych i zwolnionych pokrywa `AccessExpiry\AccessExpiryEnforcementTest`
     * (H04); tutaj zostaje sam wiersz §5(d) matrycy.
     */
    #[Test]
    public function matrix_5d(): void
    {
        $this->actingAsRole('volunteer', ['access_expires_at' => now()->subDay()]);

        $this->getJson('/api/v1/internship/entries')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');

        $this->getJson('/api/v1/me')->assertOk();
        $this->postJson('/api/v1/me/exports')->assertStatus(202);

        $expired = User::factory()->create([
            'password' => 'demo1234',
            'access_expires_at' => now()->subYear(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $expired->email,
            'password' => 'demo1234',
        ])->assertOk();
    }

    /**
     * §5(e) — prowadzący nie widzi grupy innego prowadzącego: `/instructor/group`
     * zwraca wyłącznie własnych podopiecznych i własne terminy, a cudzy termin
     * jest dla niego nieodróżnialny od nieistniejącego (kontrakt §1.1: 404, nie
     * ujawniamy istnienia — ta sama reguła co `matrix_5b`).
     */
    #[Test]
    public function matrix_5e(): void
    {
        $instructor = $this->actingAsRole('instructor');
        $otherInstructor = User::factory()->create(['role' => 'instructor']);

        $ownMember = User::factory()->create(['role' => 'volunteer']);
        $foreignMember = User::factory()->create(['role' => 'volunteer']);

        foreach ([[$ownMember, $instructor], [$foreignMember, $otherInstructor]] as [$volunteer, $supervisor]) {
            SupervisorAssignment::create([
                'volunteer_id' => $volunteer->id,
                'supervisor_id' => $supervisor->id,
                'assigned_at' => now(),
            ]);
        }

        $foreignSlot = SupervisionSlot::create([
            'supervisor_id' => $otherInstructor->id,
            'starts_at' => now()->subDays(2),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala demo',
        ]);

        $this->getJson('/api/v1/instructor/group')
            ->assertOk()
            ->assertJsonCount(1, 'data.members')
            ->assertJsonPath('data.members.0.id', $ownMember->id)
            ->assertJsonCount(0, 'data.slots');

        $this->patchJson("/api/v1/instructor/slots/{$foreignSlot->id}/attendance", [
            'attendance' => [(string) $foreignMember->id => 'present'],
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * §5(f) — nikt nie modyfikuje dziennika działań. Kontrakt: „Trasy
     * modyfikacji audytu nie istnieją (próba → 404)."
     *
     * Testujemy wyłącznie podścieżki z id (`/admin/audit/1`) — od H20
     * `GET /admin/audit` (bez id) jest prawdziwą, zarejestrowaną trasą, więc
     * `POST` pod ten sam adres trafia w 405 (zła metoda), nie 404 (brak
     * trasy). To nie jest przypadek objęty tym kryterium.
     */
    #[Test]
    public function matrix_5f(): void
    {
        $this->actingAsRole('super_admin');

        foreach ([
            ['POST', '/api/v1/admin/audit/1'],
            ['PATCH', '/api/v1/admin/audit/1'],
            ['DELETE', '/api/v1/admin/audit/1'],
        ] as [$method, $uri]) {
            $this->json($method, $uri)->assertStatus(404);
        }

        $mutatingAuditRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(function ($route): bool {
                return str_contains($route->uri(), 'admin/audit')
                    && count(array_intersect($route->methods(), ['POST', 'PUT', 'PATCH', 'DELETE'])) > 0;
            });

        $this->assertCount(0, $mutatingAuditRoutes, 'Nie może istnieć trasa modyfikująca dziennik działań.');
    }
}
