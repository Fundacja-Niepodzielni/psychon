<?php

namespace Tests\Feature\H12;

use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Świadek acceptance-owego kryterium: rola prowadzącego w modelu uprawnień, widok postępów
 * grupy i zgłoszenie do administracji — potwierdzone testem uprawnień w wariancie pozytywnym
 * i negatywnym.
 *
 * Pisany z kryterium i z tras zarejestrowanych w routes/api/h12.php, nie z odczytu
 * kontrolera/żądania/zasobu obsługującego te trasy.
 *
 * Cztery nogi, każda pozytywna i negatywna:
 *  1. zgłoszenie sprawy do administracji — zapis przez prowadzącego i odczyt przez administrację
 *     (dwa różne konta, nie sam kod 2xx).
 *  2. zgłoszenie sprawy — osoba uczestnicząca tą trasą sprawy nie zgłasza.
 *  3. wyłączność grup — dwóch prowadzących z dwiema grupami, każdy widzi tylko swoją.
 *  4. lista administracji — widzi administracja, nie widzi prowadzący ani osoba uczestnicząca.
 *
 * Kształt odmowy (403) przejęty z zastanego zachowania trasy
 * GET /api/v1/admin/supervision/slots (AdminSupervisionSlotsCriterionWitnessTest) — nie wymyślony
 * tutaj na nowo.
 */
class InstructorPermissionsCriterionWitnessTest extends TestCase
{
    use RefreshDatabase;

    public function test_instructor_reports_case_and_administration_sees_it(): void
    {
        $instructor = User::factory()->create([
            'role' => 'instructor',
            'last_name' => 'ZglaszajacaProwadzaca',
        ]);
        $volunteer = User::factory()->create([
            'role' => 'volunteer',
            'last_name' => 'PodopiecznaOsoba',
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        $admin = User::factory()->create(['role' => 'project_manager']);

        $response = $this->actingAs($instructor, 'sanctum')
            ->postJson('/api/v1/instructor/cases', [
                'volunteer_id' => $volunteer->id,
                'subject' => 'Sprawa-Swiadek-Pozytywna-100',
                'body' => 'Treść zgłoszenia do administracji, napisana przez prowadzącą.',
            ]);

        $response->assertSuccessful();

        $listResponse = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/supervision/cases');

        $listResponse->assertOk();

        // Noga 1 (pozytywna) — sprawa dotarła do DRUGIEJ roli, nie tylko odpowiedź 2xx zapisu.
        $this->assertStringContainsString('Sprawa-Swiadek-Pozytywna-100', $listResponse->getContent());
    }

    public function test_volunteer_cannot_report_case(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $otherVolunteer = User::factory()->create(['role' => 'volunteer']);

        $response = $this->actingAs($volunteer, 'sanctum')
            ->postJson('/api/v1/instructor/cases', [
                'volunteer_id' => $otherVolunteer->id,
                'subject' => 'Sprawa-Swiadek-Negatywna-100',
                'body' => 'Osoba uczestnicząca próbuje zgłosić sprawę trasą prowadzącego.',
            ]);

        // Zapisuję, co widzę: kształt odmowy trasy /instructor/cases mierzę tu po raz
        // pierwszy — 403 jest zastanym kształtem trasy siostrzanej /admin/supervision/slots.
        $response->assertStatus(403);
    }

    public function test_guest_cannot_report_case(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $response = $this->postJson('/api/v1/instructor/cases', [
            'volunteer_id' => $volunteer->id,
            'subject' => 'Sprawa-Swiadek-Gosc-100',
            'body' => 'Gość bez sesji próbuje zgłosić sprawę.',
        ]);

        $response->assertStatus(401);
    }

    public function test_instructor_sees_own_group_not_the_other_instructors_group(): void
    {
        $instructorA = User::factory()->create(['role' => 'instructor']);
        $instructorB = User::factory()->create(['role' => 'instructor']);

        $volunteerA = User::factory()->create([
            'role' => 'volunteer',
            'last_name' => 'CzlonkiniGrupyA',
        ]);
        $volunteerB = User::factory()->create([
            'role' => 'volunteer',
            'last_name' => 'CzlonkiniGrupyB',
        ]);

        SupervisorAssignment::create([
            'volunteer_id' => $volunteerA->id,
            'supervisor_id' => $instructorA->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteerB->id,
            'supervisor_id' => $instructorB->id,
            'assigned_at' => now(),
        ]);

        $responseA = $this->actingAs($instructorA, 'sanctum')
            ->getJson('/api/v1/instructor/group');

        $responseA->assertOk();

        // Noga 3 (pozytywna) — widzi swoją grupę.
        $this->assertStringContainsString('CzlonkiniGrupyA', $responseA->getContent());
        // Noga 3 (negatywna) — nie widzi grupy cudzej, choć obie grupy istnieją w bazie
        // równocześnie (dwaj prowadzący, dwie grupy — nie „prowadzący bez grupy").
        $this->assertStringNotContainsString('CzlonkiniGrupyB', $responseA->getContent());
    }

    public function test_administration_list_visible_to_admins_and_refused_to_others(): void
    {
        $projectManager = User::factory()->create(['role' => 'project_manager']);
        $superAdmin = User::factory()->create(['role' => 'super_admin']);
        $instructor = User::factory()->create(['role' => 'instructor']);
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $projectManagerResponse = $this->actingAs($projectManager, 'sanctum')
            ->getJson('/api/v1/admin/supervision/cases');
        $superAdminResponse = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/admin/supervision/cases');
        $instructorResponse = $this->actingAs($instructor, 'sanctum')
            ->getJson('/api/v1/admin/supervision/cases');
        $volunteerResponse = $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/admin/supervision/cases');

        // Noga 4 (pozytywna) — obie role administracyjne z kryterium wchodzą.
        $projectManagerResponse->assertOk();
        $superAdminResponse->assertOk();

        // Noga 4 (negatywna) — kształt odmowy zastany z /admin/supervision/slots (403).
        $instructorResponse->assertStatus(403);
        $volunteerResponse->assertStatus(403);
    }
}
