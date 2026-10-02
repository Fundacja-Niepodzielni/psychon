<?php

namespace App\Services\H20;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\CooperationRequest;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Document;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\LegalDocumentVersion;
use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
use App\Models\Setting;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\TestAttempt;
use App\Models\User;

/**
 * Dziennik działań (H20) — słownik grup zdarzeń i podmiotów wpisów.
 *
 * Grupy: każdy kod z rejestru (`AuditIndexRequest::ACTIONS`) należy do
 * DOKŁADNIE jednej grupy, a każdy ma jedno zdanie po polsku (czynność z
 * zamkniętej listy w `CZYNNOSCI`, bez wartości i bez treści wpisanej ręcznie).
 * Zdania są tu po to, żeby eksport mówił tymi samymi słowami co ekran —
 * ekran ma ich kopię w `frontend/nowy-front/dziennik-dzialan/slownik.ts`,
 * a próby po obu stronach pilnują, że obie listy są równe.
 *
 * Podmioty: dla każdego typu podmiotu — czyja to rzecz (kolumna osoby w
 * tabeli podmiotu, z której wynika „kogo dotyczy”) i jak się ta rzecz
 * nazywa po ludzku. Ta sama tabela zasila filtr „dotyczy” w zapytaniu
 * (`AdminAuditQuery`) i nazwę w zasobie wpisu — jedna reguła, bez drugiej
 * kopii. Typ podmiotu w bazie to pełna nazwa klasy (projekt nie ma mapy
 * skrótów typów).
 */
final class AuditLogMap
{
    /** Grupy zdarzeń w kolejności filtra. */
    public const array GROUPS = [
        'konta' => 'Konta i role',
        'nabor' => 'Nabór',
        'kursy' => 'Kursy i testy',
        'staz' => 'Staż i dyżury',
        'superwizja' => 'Superwizja',
        'dokumenty' => 'Dokumenty i certyfikaty',
        'inne' => 'Inne',
    ];

    /**
     * Zamknięta lista czynności — pierwsze słowa zdań. Zdanie spoza listy
     * czerwieni próbę: dziennik mówi, CO zrobiono, nigdy z jaką wartością.
     */
    public const array CZYNNOSCI = [
        'Utworzono', 'Zmieniono', 'Usunięto', 'Zablokowano', 'Zanonimizowano', 'Przedłużono',
        'Przyjęto', 'Odrzucono', 'Przypisano', 'Odpięto', 'Zakończono', 'Wyzerowano', 'Zaliczono',
        'Zatwierdzono', 'Odesłano', 'Wydano', 'Unieważniono', 'Wygenerowano', 'Wyświetlono',
        'Opublikowano', 'Zaakceptowano', 'Wycofano', 'Odnotowano', 'Odwołano', 'Złożono',
        'Odpowiedziano',
    ];

    /** Kod zdarzenia → grupa i zdanie. */
    public const array EVENTS = [
        'user.created' => ['konta', 'Utworzono konto'],
        'user.updated' => ['konta', 'Zmieniono dane konta'],
        'user.blocked' => ['konta', 'Zablokowano konto'],
        'user.anonymized' => ['konta', 'Zanonimizowano konto'],
        'access.extended' => ['konta', 'Przedłużono dostęp'],
        'application.accepted' => ['nabor', 'Przyjęto zgłoszenie rekrutacyjne'],
        'application.rejected' => ['nabor', 'Odrzucono zgłoszenie rekrutacyjne'],
        'course.created' => ['kursy', 'Utworzono kurs'],
        'course.updated' => ['kursy', 'Zmieniono kurs'],
        'course.deleted' => ['kursy', 'Usunięto kurs'],
        'assignment.created' => ['kursy', 'Przypisano prowadzącego do kursu'],
        'assignment.removed' => ['kursy', 'Odpięto prowadzącego od kursu'],
        'attempt.finished' => ['kursy', 'Zakończono podejście do testu'],
        'attempts.reset' => ['kursy', 'Wyzerowano limit podejść do testu'],
        'workshop.completed' => ['kursy', 'Zaliczono warsztat'],
        'internship.accepted' => ['staz', 'Zatwierdzono dyżur'],
        'internship.returned' => ['staz', 'Odesłano dyżur do poprawy'],
        'internship.rejected' => ['staz', 'Odrzucono dyżur'],
        'supervisor.assigned' => ['superwizja', 'Przypisano superwizora'],
        'supervision.attendance_marked' => ['superwizja', 'Odnotowano obecność na superwizji'],
        'supervision.slot_cancelled' => ['superwizja', 'Odwołano termin superwizji'],
        'certificate.issued' => ['dokumenty', 'Wydano certyfikat'],
        'certificate.revoked' => ['dokumenty', 'Unieważniono certyfikat'],
        'document.generated' => ['dokumenty', 'Wygenerowano dokument'],
        'sensitive.viewed' => ['dokumenty', 'Wyświetlono dokument wrażliwy'],
        'legal_document.published' => ['dokumenty', 'Opublikowano dokument prawny'],
        'legal_document.accepted' => ['dokumenty', 'Zaakceptowano dokument prawny'],
        'edition.updated' => ['inne', 'Zmieniono ustawienia edycji'],
        'notification_settings.updated' => ['inne', 'Zmieniono ustawienia powiadomień'],
        'profile.accepted' => ['inne', 'Zaakceptowano profil psychologa'],
        'profile.returned' => ['inne', 'Odesłano profil psychologa do poprawy'],
        'profile.withdrawn' => ['inne', 'Wycofano profil psychologa'],
        'cooperation_request.created' => ['inne', 'Złożono prośbę o dalszą współpracę'],
        'cooperation_request.answered' => ['inne', 'Odpowiedziano na prośbę o dalszą współpracę'],
    ];

    /**
     * Podmioty należące do jednej osoby: typ → [tabela, kolumna osoby].
     * Konto (`User`) jest osobą samo w sobie; dokument profilu należy do
     * osoby przez profil (osobny przypadek w `ownerSql`).
     */
    public const array OWNED = [
        InternshipEntry::class => ['internship_entries', 'user_id'],
        TestAttempt::class => ['test_attempts', 'user_id'],
        Certificate::class => ['certificates', 'user_id'],
        Document::class => ['documents', 'user_id'],
        PsychologistProfile::class => ['psychologist_profiles', 'user_id'],
        Application::class => ['applications', 'user_id'],
        SupervisorAssignment::class => ['supervisor_assignments', 'volunteer_id'],
        SupervisionSignup::class => ['supervision_signups', 'user_id'],
        SupervisionSlot::class => ['supervision_slots', 'supervisor_id'],
        CourseAssignment::class => ['course_assignments', 'instructor_id'],
        CooperationRequest::class => ['cooperation_requests', 'user_id'],
    ];

    /** Nazwy rzeczy, które nie mają własnego tytułu. */
    public const array THING_NAMES = [
        InternshipEntry::class => 'Wpis w dzienniku stażu',
        Certificate::class => 'Certyfikat',
        PsychologistProfile::class => 'Profil psychologa',
        ProfileDocument::class => 'Dokument profilu psychologa',
        Application::class => 'Zgłoszenie rekrutacyjne',
        SupervisorAssignment::class => 'Przypisanie superwizora',
        SupervisionSignup::class => 'Zapis na superwizję',
        SupervisionSlot::class => 'Termin superwizji',
        CooperationRequest::class => 'Prośba o dalszą współpracę',
        Setting::class => 'Ustawienia powiadomień',
    ];

    /** Rodzaje dokumentów osoby (`documents.type`). */
    public const array DOCUMENT_TYPES = [
        'volunteer_agreement' => 'Porozumienie wolontariackie',
        'internship_certificate' => 'Zaświadczenie o stażu',
    ];

    /** Rodzaje dokumentów prawnych (`LegalDocumentVersion::TYPES`). */
    public const array LEGAL_TYPES = [
        'regulamin' => 'Regulamin',
        'polityka' => 'Polityka prywatności',
        'klauzula-rodo' => 'Klauzula informacyjna RODO',
    ];

    /** Nazwa wpisu bez podmiotu (dziś tylko zmiana kolejności kursów). */
    public const string NO_SUBJECT = 'Kolejność kursów';

    /** Nazwa podmiotu typu, którego ten słownik nie zna — nigdy nazwa klasy ani numer. */
    public const string UNKNOWN_SUBJECT = 'Inny obiekt systemu';

    /** Kurs, edycja i dokument prawny mają własne nazwy, czytane z bazy. */
    public const array TITLED = [Course::class, Edition::class, LegalDocumentVersion::class];

    public static function group(string $action): string
    {
        return self::EVENTS[$action][0] ?? 'inne';
    }

    public static function groupLabel(string $action): string
    {
        return self::GROUPS[self::group($action)];
    }

    public static function sentence(string $action): string
    {
        return self::EVENTS[$action][1] ?? 'Odnotowano zdarzenie';
    }

    /**
     * Kody zdarzeń jednej grupy.
     *
     * @return list<string>
     */
    public static function actionsIn(string $group): array
    {
        return array_keys(array_filter(self::EVENTS, static fn (array $event): bool => $event[0] === $group));
    }

    /**
     * Wyrażenie SQL dające identyfikator osoby, której dotyczy wpis
     * (`audit_log.subject_type` / `subject_id`): samo konto, właściciel rzeczy
     * albo `NULL`, gdy wpis nie dotyczy osoby. Zwraca treść i wiązania.
     *
     * @return array{0: string, 1: list<string>}
     */
    public static function ownerSql(): array
    {
        $parts = ['WHEN ? THEN audit_log.subject_id'];
        $bindings = [User::class];

        foreach (self::OWNED as $type => [$table, $column]) {
            $parts[] = "WHEN ? THEN (SELECT {$table}.{$column} FROM {$table} WHERE {$table}.id = audit_log.subject_id)";
            $bindings[] = $type;
        }

        $parts[] = 'WHEN ? THEN (SELECT psychologist_profiles.user_id FROM profile_documents'
            .' JOIN psychologist_profiles ON psychologist_profiles.id = profile_documents.profile_id'
            .' WHERE profile_documents.id = audit_log.subject_id)';
        $bindings[] = ProfileDocument::class;

        return ['(CASE audit_log.subject_type '.implode(' ', $parts).' ELSE NULL END)', $bindings];
    }
}
