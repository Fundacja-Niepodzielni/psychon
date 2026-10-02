<?php

namespace App\Queries;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Document;
use App\Models\Edition;
use App\Models\LegalDocumentVersion;
use App\Models\ProfileDocument;
use App\Models\TestAttempt;
use App\Models\User;
use App\Services\H20\AuditLogMap;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Dziennik działań (H20, `GET /admin/audit` oraz `GET /admin/audit/export.csv`).
 * Filtry płaskie zgodnie z kontraktem §2, wspólne dla listy i CSV, żeby oba
 * zawężały się identycznie:
 *  - `action` — kod z rejestru §3.2 (walidowany w `AuditIndexRequest`),
 *  - `group` — grupa zdarzeń (`AuditLogMap::GROUPS`),
 *  - `user_id` — wykonawca (kto wykonał akcję), `actor_search` — wykonawca po
 *    imieniu i nazwisku,
 *  - `subject_user_id` — osoba, której wpis dotyczy: samo konto albo rzecz tej
 *    osoby (wpis stażu, podejście do testu, dokument…; `AuditLogMap::ownerSql`),
 *    `subject_search` — ta sama osoba po imieniu i nazwisku (także imię i
 *    nazwisko ze zgłoszenia rekrutacyjnego bez konta),
 *  - `from`/`to` — zakres po `created_at`; sama data w `to` obejmuje cały ten
 *    dzień (dotąd północ ucinała wpisy z ostatniego dnia zakresu).
 */
final class AdminAuditQuery
{
    public static function fromRequest(Request $request): Builder
    {
        $query = AuditLogEntry::query()->with('actor');

        if (($action = trim((string) $request->query('action', ''))) !== '') {
            $query->where('action', $action);
        }

        if (($group = trim((string) $request->query('group', ''))) !== '') {
            $query->whereIn('action', AuditLogMap::actionsIn($group));
        }

        if ($request->filled('user_id')) {
            $query->where('actor_id', (int) $request->query('user_id'));
        }

        if (($actor = self::term($request, 'actor_search')) !== null) {
            $query->whereIn('actor_id', self::usersMatching($actor));
        }

        if ($request->filled('subject_user_id')) {
            [$owner, $bindings] = AuditLogMap::ownerSql();
            $query->whereRaw("{$owner} = ?", [...$bindings, (int) $request->query('subject_user_id')]);
        }

        if (($subject = self::term($request, 'subject_search')) !== null) {
            [$owner, $bindings] = AuditLogMap::ownerSql();
            $query->where(function (Builder $q) use ($owner, $bindings, $subject): void {
                $q->whereRaw("{$owner} IN (".self::usersMatching($subject)->toSql().')', [
                    ...$bindings,
                    ...self::usersMatching($subject)->getBindings(),
                ])->orWhere(function (Builder $applicant) use ($subject): void {
                    $applicant->where('subject_type', Application::class)
                        ->whereIn('subject_id', self::namesMatching(DB::table('applications'), $subject)->select('id'));
                });
            });
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $to = (string) $request->query('to');
            preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) === 1
                ? $query->where('created_at', '<', Carbon::parse($to)->addDay()->toDateString())
                : $query->where('created_at', '<=', $to);
        }

        return $query->orderByDesc('created_at')->orderByDesc('id');
    }

    /**
     * `page`/`per_page` zgodnie z kontraktem §1 (domyślnie 25, maksimum 100).
     */
    public static function perPage(Request $request): int
    {
        return min(max((int) $request->integer('per_page', 25), 1), 100);
    }

    /**
     * „Kogo dotyczy” dla zbioru wpisów, odczytane paczkami (jedno zapytanie na
     * typ podmiotu i jedno na osoby), nigdy wiersz po wierszu. Wynik po `id`
     * wpisu: `person` — osoba, której wpis dotyczy (`id` jest `null`, gdy to
     * osoba ze zgłoszenia rekrutacyjnego bez konta), `label` — nazwa rzeczy
     * (tytuł kursu, „Wpis w dzienniku stażu”…), nigdy typ techniczny i numer.
     *
     * @param  iterable<AuditLogEntry>  $entries
     * @return array<int, array{person: array{id: int|null, first_name: string, last_name: string}|null, label: string|null}>
     */
    public static function subjects(iterable $entries): array
    {
        $entries = collect($entries);
        $owners = [];
        $names = [];
        $labels = [];

        foreach ($entries->groupBy(fn (AuditLogEntry $entry): string => (string) $entry->subject_type) as $type => $group) {
            $ids = $group->pluck('subject_id')->filter()->unique()->values()->all();
            $rows = self::subjectRows($type, $ids);

            foreach ($group as $entry) {
                $row = $rows->get($entry->subject_id);
                [$owners[$entry->id], $names[$entry->id], $labels[$entry->id]] = self::describe($type, $entry, $row);
            }
        }

        $people = DB::table('users')
            ->whereIn('id', array_values(array_filter($owners, static fn ($id): bool => $id !== null)))
            ->get(['id', 'first_name', 'last_name'])
            ->keyBy('id');

        $lessonIds = $entries
            ->filter(fn (AuditLogEntry $entry): bool => $entry->subject_type === Course::class && isset($entry->details['lesson_id']))
            ->map(fn (AuditLogEntry $entry): int => (int) $entry->details['lesson_id'])
            ->unique()->values()->all();
        $lessons = $lessonIds === [] ? collect() : DB::table('lessons')->whereIn('id', $lessonIds)->pluck('title', 'id');

        $result = [];
        foreach ($entries as $entry) {
            $owner = $owners[$entry->id] ?? null;
            $user = $owner === null ? null : $people->get($owner);
            $person = $user !== null
                ? ['id' => (int) $user->id, 'first_name' => (string) $user->first_name, 'last_name' => (string) $user->last_name]
                : ($names[$entry->id] ?? null);

            $label = $labels[$entry->id] ?? null;
            $lesson = isset($entry->details['lesson_id']) ? $lessons->get((int) $entry->details['lesson_id']) : null;
            if ($entry->subject_type === Course::class && $label !== null && $lesson !== null) {
                $label .= ' · lekcja „'.$lesson.'”';
            }

            $result[$entry->id] = ['person' => $person, 'label' => $label];
        }

        return $result;
    }

    /**
     * Wiersze podmiotów jednego typu po `id` — tylko kolumny potrzebne do
     * nazwy i do osoby; `DB::table`, więc także rekordy usunięte miękko.
     *
     * @param  list<int>  $ids
     * @return Collection<int, object>
     */
    private static function subjectRows(string $type, array $ids): Collection
    {
        if ($ids === []) {
            return collect();
        }

        $rows = match (true) {
            $type === TestAttempt::class => DB::table('test_attempts')
                ->leftJoin('tests', 'tests.id', '=', 'test_attempts.test_id')
                ->leftJoin('courses', 'courses.id', '=', 'tests.course_id')
                ->whereIn('test_attempts.id', $ids)
                ->get(['test_attempts.id', 'test_attempts.user_id as owner_id', 'courses.title']),
            $type === CourseAssignment::class => DB::table('course_assignments')
                ->leftJoin('courses', 'courses.id', '=', 'course_assignments.course_id')
                ->whereIn('course_assignments.id', $ids)
                ->get(['course_assignments.id', 'course_assignments.instructor_id as owner_id', 'courses.title']),
            $type === Application::class => DB::table('applications')
                ->whereIn('id', $ids)
                ->get(['id', 'user_id as owner_id', 'first_name', 'last_name']),
            $type === Document::class => DB::table('documents')
                ->whereIn('id', $ids)
                ->get(['id', 'user_id as owner_id', 'type']),
            $type === ProfileDocument::class => DB::table('profile_documents')
                ->leftJoin('psychologist_profiles', 'psychologist_profiles.id', '=', 'profile_documents.profile_id')
                ->whereIn('profile_documents.id', $ids)
                ->get(['profile_documents.id', 'psychologist_profiles.user_id as owner_id']),
            isset(AuditLogMap::OWNED[$type]) => DB::table(AuditLogMap::OWNED[$type][0])
                ->whereIn('id', $ids)
                ->get(['id', AuditLogMap::OWNED[$type][1].' as owner_id']),
            $type === Course::class => DB::table('courses')->whereIn('id', $ids)->get(['id', 'title']),
            $type === Edition::class => DB::table('editions')->whereIn('id', $ids)->get(['id', 'name']),
            $type === LegalDocumentVersion::class => DB::table('legal_document_versions')
                ->whereIn('id', $ids)
                ->get(['id', 'type', 'version']),
            default => collect(),
        };

        return $rows->keyBy('id');
    }

    /**
     * Osoba (identyfikator konta), osoba bez konta (imię i nazwisko ze
     * zgłoszenia) i nazwa rzeczy dla jednego wpisu.
     *
     * @return array{0: int|null, 1: array{id: null, first_name: string, last_name: string}|null, 2: string|null}
     */
    private static function describe(string $type, AuditLogEntry $entry, ?object $row): array
    {
        if ($type === '') {
            return [null, null, $entry->action === 'course.updated' ? AuditLogMap::NO_SUBJECT : null];
        }

        if ($type === User::class) {
            return [(int) $entry->subject_id, null, null];
        }

        $owner = isset($row->owner_id) ? (int) $row->owner_id : null;

        return match (true) {
            $type === TestAttempt::class => [
                $owner, null, isset($row->title) ? 'Test w kursie „'.$row->title.'”' : 'Test',
            ],
            $type === CourseAssignment::class => [$owner, null, $row->title ?? 'Usunięty kurs'],
            $type === Application::class => [
                $owner,
                $owner === null && $row !== null
                    ? ['id' => null, 'first_name' => (string) $row->first_name, 'last_name' => (string) $row->last_name]
                    : null,
                AuditLogMap::THING_NAMES[Application::class],
            ],
            $type === Document::class => [$owner, null, AuditLogMap::DOCUMENT_TYPES[$row->type ?? ''] ?? 'Dokument'],
            isset(AuditLogMap::OWNED[$type]), $type === ProfileDocument::class => [$owner, null, AuditLogMap::THING_NAMES[$type]],
            $type === Course::class => [null, null, $row->title ?? 'Usunięty kurs'],
            $type === Edition::class => [null, null, $row !== null ? 'Edycja '.$row->name : 'Edycja'],
            $type === LegalDocumentVersion::class => [
                null,
                null,
                $row !== null
                    ? (AuditLogMap::LEGAL_TYPES[$row->type] ?? 'Dokument prawny').', wersja '.$row->version
                    : 'Dokument prawny',
            ],
            isset(AuditLogMap::THING_NAMES[$type]) => [null, null, AuditLogMap::THING_NAMES[$type]],
            default => [null, null, AuditLogMap::UNKNOWN_SUBJECT],
        };
    }

    /** Fraza wyszukiwania z parametru albo `null`, gdy pusta. */
    private static function term(Request $request, string $key): ?string
    {
        $value = trim((string) $request->query($key, ''));

        return $value === '' ? null : $value;
    }

    /** Identyfikatory kont, których imię i nazwisko pasuje do frazy (także z usuniętych miękko). */
    private static function usersMatching(string $term): QueryBuilder
    {
        return self::namesMatching(DB::table('users'), $term)->select('id');
    }

    /**
     * Imię, nazwisko albo „imię nazwisko” zawiera frazę — bez rozróżniania
     * wielkości liter, z `%` i `_` traktowanymi dosłownie (jak `AdminUserQuery`).
     */
    private static function namesMatching(QueryBuilder $table, string $term): QueryBuilder
    {
        $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $term).'%';

        return $table->where(function (QueryBuilder $q) use ($like): void {
            $q->where('first_name', 'ilike', $like)
                ->orWhere('last_name', 'ilike', $like)
                ->orWhereRaw("(first_name || ' ' || last_name) ilike ?", [$like]);
        });
    }
}
