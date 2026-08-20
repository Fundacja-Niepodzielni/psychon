<?php

namespace Database\Seeders;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\Consent;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Document;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\InstructorProfile;
use App\Models\InstructorQuestion;
use App\Models\InternshipEntry;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Material;
use App\Models\Notification;
use App\Models\PsychologistProfile;
use App\Models\Setting;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Canonical demo state — docs/hackathon/04-seed-demo.md is the source of
 * truth for every number here. A mismatch between that file and this
 * seeder is a bug in the seeder. Package acceptance criteria rely on
 * these exact values, so change them only via the schema guardian.
 */
class DemoSeeder extends Seeder
{
    /** Lesson durations (s) for the full courses 1-3. */
    private const array FULL_COURSE_DURATIONS = [1800, 1500, 2100, 1200, 1600];

    /** Lesson durations (s) for the skeleton courses 4-10. */
    private const array SKELETON_COURSE_DURATIONS = [1800, 1500];

    public function run(): void
    {
        if (User::where('email', 'marta@demo.pl')->exists()) {
            return; // already seeded — keep the canonical state intact
        }

        $edition = $this->seedEdition();
        $users = $this->seedUsers($edition);
        $courses = $this->seedCourses($edition);
        $webinar = $this->seedInvitedWebinar();
        $this->seedTests($courses);
        $this->seedInstructor($users, $courses);

        $this->seedMartaProgress($users['marta'], $courses);
        $this->seedOlaProgress($users['ola'], $courses);
        $this->seedFilipProgress($users['filip'], $courses);

        $this->seedInternship($users);
        $this->seedSupervision($users);
        $this->seedOlaCompletion($users, $edition);
        $this->seedMartaDocumentAndNotifications($users, $edition);
        $this->seedApplication($edition);
        $this->seedConsents($users);
        $this->seedSettings();
    }

    private function seedEdition(): Edition
    {
        return Edition::create([
            'name' => 'Edycja 2026',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
    }

    /**
     * @return array<string, User>
     */
    private function seedUsers(Edition $edition): array
    {
        $demoPassword = Hash::make('demo1234');
        $adminPassword = Hash::make('admin1234');

        $shared = [
            'edition_id' => $edition->id,
            'status' => 'active',
            'product_group' => 'psychon',
            'email_verified_at' => now(),
        ];

        $marta = User::create([
            ...$shared,
            'first_name' => 'Marta',
            'last_name' => 'Demo',
            'email' => 'marta@demo.pl',
            'password' => $demoPassword,
            'phone' => '+48 600 100 200',
            'pesel' => '90010112345', // fictional
            'address_street' => 'ul. Przykładowa 1/2',
            'address_city' => 'Warszawa',
            'address_zip' => '00-001',
            'role' => 'volunteer',
            'access_expires_at' => now()->addMonths(6),
        ]);

        $ola = User::create([
            ...$shared,
            'first_name' => 'Ola',
            'last_name' => 'Demo',
            'email' => 'ola@demo.pl',
            'password' => $demoPassword,
            'phone' => '+48 600 100 300',
            'pesel' => '85050554321', // fictional
            'address_street' => 'ul. Wzorcowa 3',
            'address_city' => 'Kraków',
            'address_zip' => '30-001',
            'role' => 'volunteer',
            'access_expires_at' => now()->addMonths(2),
            'program_completed_at' => now()->subDays(14), // graduate — no time limit anymore
        ]);

        $filip = User::create([
            ...$shared,
            'first_name' => 'Filip',
            'last_name' => 'Demo',
            'email' => 'filip@demo.pl',
            'password' => $demoPassword,
            'phone' => '+48 600 100 400',
            'pesel' => '99120887654', // fictional
            'role' => 'student',
            'access_expires_at' => now()->addMonths(6),
        ]);

        $joanna = User::create([
            ...$shared,
            'first_name' => 'Joanna',
            'last_name' => 'Demo',
            'email' => 'joanna@demo.pl',
            'password' => $demoPassword,
            'phone' => '+48 600 100 500',
            'role' => 'instructor',
        ]);

        $opiekun = User::create([
            ...$shared,
            'first_name' => 'Ola',
            'last_name' => 'Opiekunka',
            'email' => 'opiekun@demo.pl',
            'password' => $adminPassword,
            'role' => 'project_manager',
        ]);

        $admin = User::create([
            ...$shared,
            'first_name' => 'Adam',
            'last_name' => 'Admin',
            'email' => 'admin@demo.pl',
            'password' => $adminPassword,
            'role' => 'super_admin',
        ]);

        return compact('marta', 'ola', 'filip', 'joanna', 'opiekun', 'admin');
    }

    /**
     * 10 path courses (psychon): 1-3 full (5 lessons + a PDF material),
     * 4-10 skeleton (2 lessons).
     *
     * @return array<int, Course> keyed by sequence_order
     */
    private function seedCourses(Edition $edition): array
    {
        $titles = [
            1 => ['Podstawy pomocy psychologicznej', 'podstawy-pomocy'],
            2 => ['Wywiad psychologiczny', 'wywiad-psychologiczny'],
            3 => ['Interwencja kryzysowa', 'interwencja-kryzysowa'],
            4 => ['Praca z emocjami', 'praca-z-emocjami'],
            5 => ['Komunikacja wspierająca', 'komunikacja-wspierajaca'],
            6 => ['Kryzys suicydalny — pierwsza pomoc', 'kryzys-suicydalny'],
            7 => ['Wsparcie młodzieży', 'wsparcie-mlodziezy'],
            8 => ['Granice i etyka pomagania', 'granice-i-etyka'],
            9 => ['Higiena pracy pomagacza', 'higiena-pracy-pomagacza'],
            10 => ['Superwizja i dalszy rozwój', 'superwizja-i-rozwoj'],
        ];

        $courses = [];

        foreach ($titles as $order => [$title, $slug]) {
            $course = Course::create([
                'title' => $title,
                'slug' => $slug,
                'description' => "Etap {$order} ścieżki szkoleniowej PsychON.",
                'type' => 'course',
                'product_group' => 'psychon',
                'sequence_order' => $order,
                'edition_id' => $edition->id,
                'is_published' => true,
            ]);

            $durations = $order <= 3 ? self::FULL_COURSE_DURATIONS : self::SKELETON_COURSE_DURATIONS;

            foreach ($durations as $index => $duration) {
                $number = $index + 1;

                Lesson::create([
                    'course_id' => $course->id,
                    'title' => "Lekcja {$number}: {$title}",
                    'description' => "Materiał wideo do etapu {$order}, część {$number}.",
                    'sequence_order' => $number,
                    'video_provider_id' => "mock-{$slug}-{$number}",
                    'duration_seconds' => $duration,
                ]);
            }

            if ($order <= 3) {
                Material::create([
                    'course_id' => $course->id,
                    'name' => "Karta pracy — {$title}.pdf",
                    'file_path' => "materials/{$slug}/karta-pracy.pdf",
                    'mime' => 'application/pdf',
                    'size' => 245_760,
                ]);
            }

            $courses[$order] = $course;
        }

        return $courses;
    }

    /**
     * The invited course outside the sequence (webinar, psychon) for Filip.
     * sequence_order = null → available without unlocking (starter rule).
     */
    private function seedInvitedWebinar(): Course
    {
        $webinar = Course::create([
            'title' => 'Webinar: Pierwsza rozmowa wspierająca',
            'slug' => 'webinar-pierwsza-rozmowa',
            'description' => 'Webinar poza ścieżką — dostęp z zaproszenia.',
            'type' => 'webinar',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => true,
        ]);

        Lesson::create([
            'course_id' => $webinar->id,
            'title' => 'Nagranie webinaru',
            'sequence_order' => 1,
            'video_provider_id' => 'mock-webinar-1',
            'duration_seconds' => 3600,
        ]);

        return $webinar;
    }

    /**
     * Question bank: 10 questions with 4 answers (1 correct) for courses 1-3.
     *
     * @param  array<int, Course>  $courses
     */
    private function seedTests(array $courses): void
    {
        foreach ([1, 2, 3] as $order) {
            $course = $courses[$order];

            $test = Test::create([
                'course_id' => $course->id,
                'pass_threshold' => null, // edition value (80)
                'attempts_limit' => null, // edition value (3)
                'question_count' => 10,
            ]);

            foreach (range(1, 10) as $number) {
                $question = $test->questions()->create([
                    'body' => "Pytanie {$number} do etapu „{$course->title}”: która odpowiedź jest zgodna z materiałem lekcji?",
                    'sequence_order' => $number,
                ]);

                foreach (range(1, 4) as $answerNumber) {
                    $question->answers()->create([
                        'body' => "Odpowiedź {$answerNumber} do pytania {$number}.",
                        'is_correct' => $answerNumber === 1,
                    ]);
                }
            }
        }
    }

    /**
     * Joanna runs courses 1-3 and has an instructor profile.
     *
     * @param  array<string, User>  $users
     * @param  array<int, Course>  $courses
     */
    private function seedInstructor(array $users, array $courses): void
    {
        InstructorProfile::create([
            'user_id' => $users['joanna']->id,
            'specializations' => ['interwencja kryzysowa', 'praca z młodzieżą'],
            'bio' => 'Psycholożka z 10-letnim doświadczeniem w telefonicznej pomocy kryzysowej.',
            'experience' => 'Telefon zaufania, ośrodek interwencji kryzysowej, szkolenia wolontariuszy.',
            'city' => 'Warszawa',
            'responsibilities' => ['kursy 1-3', 'superwizja grupy wolontariuszy'],
        ]);

        foreach ([1, 2, 3] as $order) {
            CourseAssignment::create([
                'course_id' => $courses[$order]->id,
                'lesson_id' => null, // whole course
                'instructor_id' => $users['joanna']->id,
                'assigned_by' => $users['admin']->id,
                'assigned_at' => now()->subWeeks(10),
            ]);
        }

        // 1 unanswered question (queue counter = 1)
        InstructorQuestion::create([
            'user_id' => $users['marta']->id,
            'lesson_id' => $courses[2]->lessons()->first()->id,
            'question' => 'Jak reagować, gdy osoba dzwoniąca długo milczy? Czy przerywać ciszę?',
            'answer' => null,
        ]);
    }

    /**
     * Marta: course 1 completed 100%, course 2 in progress 40% (2/5 lessons),
     * reliability ≈85%; test 1 passed 90% (attempt 1/3), test 2 failed 70%.
     *
     * @param  array<int, Course>  $courses
     */
    private function seedMartaProgress(User $marta, array $courses): void
    {
        $this->completeLessons($marta, $courses[1], 5, activeShare: 0.85, daysAgo: 40);
        $this->completeLessons($marta, $courses[2], 2, activeShare: 0.85, daysAgo: 12);

        $this->createAttempt($marta, $courses[1], attemptNumber: 1, correctCount: 9, daysAgo: 30); // 90%, passed
        $this->createAttempt($marta, $courses[2], attemptNumber: 1, correctCount: 7, daysAgo: 5);  // 70%, failed
    }

    /**
     * Ola: 10/10 stages — every lesson completed, tests 1-3 passed.
     *
     * @param  array<int, Course>  $courses
     */
    private function seedOlaProgress(User $ola, array $courses): void
    {
        foreach ($courses as $order => $course) {
            $lessonCount = $order <= 3 ? 5 : 2;
            $this->completeLessons($ola, $course, $lessonCount, activeShare: 0.90, daysAgo: 120 - $order * 7);
        }

        foreach ([1, 2, 3] as $order) {
            $this->createAttempt($ola, $courses[$order], attemptNumber: 1, correctCount: 9, daysAgo: 110 - $order * 7); // 90%, passed
        }
    }

    /**
     * Filip: a "clicked-through" account — 5 lessons of course 1 completed
     * with active time ≈15% of duration (reliability flag demo).
     *
     * @param  array<int, Course>  $courses
     */
    private function seedFilipProgress(User $filip, array $courses): void
    {
        $this->completeLessons($filip, $courses[1], 5, activeShare: 0.15, daysAgo: 7);
    }

    private function completeLessons(User $user, Course $course, int $count, float $activeShare, int $daysAgo): void
    {
        foreach ($course->lessons()->take($count)->get() as $index => $lesson) {
            $completedAt = now()->subDays($daysAgo - $index);

            LessonProgress::create([
                'user_id' => $user->id,
                'lesson_id' => $lesson->id,
                'watched_seconds' => $lesson->duration_seconds,
                'active_seconds' => (int) round($lesson->duration_seconds * $activeShare),
                'open_count' => 2,
                'last_activity_at' => $completedAt,
                'is_completed' => true,
                'completed_at' => $completedAt,
            ]);
        }
    }

    /**
     * A test attempt with the questions snapshot; score = correctCount * 10.
     */
    private function createAttempt(User $user, Course $course, int $attemptNumber, int $correctCount, int $daysAgo): void
    {
        $test = $course->test()->first();
        $questions = $test->questions()->with('answers')->get();

        $answers = [];
        $snapshot = [];

        foreach ($questions as $index => $question) {
            $correct = $question->answers->firstWhere('is_correct', true);
            $wrong = $question->answers->firstWhere('is_correct', false);

            $answers[(string) $question->id] = $index < $correctCount ? $correct->id : $wrong->id;

            $snapshot[] = [
                'id' => $question->id,
                'body' => $question->body,
                'answers' => $question->answers->map(fn ($answer): array => [
                    'id' => $answer->id,
                    'body' => $answer->body,
                    'is_correct' => $answer->is_correct,
                ])->all(),
            ];
        }

        $score = $correctCount * 10;

        TestAttempt::create([
            'user_id' => $user->id,
            'test_id' => $test->id,
            'attempt_number' => $attemptNumber,
            'answers' => $answers,
            'questions_snapshot' => $snapshot,
            'score_percent' => $score,
            'passed' => $score >= 80,
            'created_at' => now()->subDays($daysAgo),
            'updated_at' => now()->subDays($daysAgo),
        ]);
    }

    /**
     * Internship diary. Marta: 9 accepted = 41.5 h and 37 consultations,
     * 1 submitted, 1 returned. Ola: 72 h accepted, 64 consultations.
     * Filip: 1 extra submitted entry (acceptance queue = 2).
     *
     * @param  array<string, User>  $users
     */
    private function seedInternship(array $users): void
    {
        $opiekun = $users['opiekun'];

        // Marta — 9 accepted entries: 41.5 h, 37 consultations in total.
        $martaEntries = [
            // [hours, consultations, form]
            ['5.0', 4, 'phone_duty'],
            ['4.5', 4, 'phone_duty'],
            ['5.0', 5, 'chat_duty'],
            ['4.0', 4, 'phone_duty'],
            ['5.0', 4, 'chat_duty'],
            ['4.5', 4, 'phone_duty'],
            ['4.0', 4, 'phone_duty'],
            ['5.0', 4, 'chat_duty'],
            ['4.5', 4, 'phone_duty'],
        ];

        foreach ($martaEntries as $index => [$hours, $consultations, $form]) {
            InternshipEntry::create([
                'user_id' => $users['marta']->id,
                'date' => now()->subDays(60 - $index * 6)->toDateString(),
                'hours' => $hours,
                'form' => $form,
                'consultations_count' => $consultations,
                'description' => 'Dyżur — rozmowy wspierające. Bez danych osób konsultowanych.',
                'status' => 'accepted',
                'decided_by' => $opiekun->id,
                'decided_at' => now()->subDays(58 - $index * 6),
            ]);
        }

        InternshipEntry::create([
            'user_id' => $users['marta']->id,
            'date' => now()->subDays(2)->toDateString(),
            'hours' => '3.0',
            'form' => 'phone_duty',
            'consultations_count' => 2,
            'description' => 'Dyżur telefoniczny — czekam na akceptację.',
            'status' => 'submitted',
        ]);

        InternshipEntry::create([
            'user_id' => $users['marta']->id,
            'date' => now()->subDays(4)->toDateString(),
            'hours' => '2.5',
            'form' => 'other',
            'consultations_count' => 1,
            'description' => 'Wsparcie przy wydarzeniu Fundacji.',
            'status' => 'returned',
            'review_comment' => 'Uzupełnij formę dyżuru i doprecyzuj liczbę konsultacji.',
            'decided_by' => $opiekun->id,
            'decided_at' => now()->subDays(3),
        ]);

        // Ola — 12 accepted entries: 72 h, 64 consultations in total.
        $olaConsultations = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 5, 5];

        foreach ($olaConsultations as $index => $consultations) {
            InternshipEntry::create([
                'user_id' => $users['ola']->id,
                'date' => now()->subDays(150 - $index * 9)->toDateString(),
                'hours' => '6.0',
                'form' => $index % 2 === 0 ? 'phone_duty' : 'chat_duty',
                'consultations_count' => $consultations,
                'description' => 'Dyżur — rozmowy wspierające. Bez danych osób konsultowanych.',
                'status' => 'accepted',
                'decided_by' => $opiekun->id,
                'decided_at' => now()->subDays(148 - $index * 9),
            ]);
        }

        // Filip — the extra entry awaiting acceptance (queue counter = 2).
        InternshipEntry::create([
            'user_id' => $users['filip']->id,
            'date' => now()->subDays(1)->toDateString(),
            'hours' => '2.0',
            'form' => 'chat_duty',
            'consultations_count' => 1,
            'description' => 'Pierwszy dyżur na czacie.',
            'status' => 'submitted',
        ]);
    }

    /**
     * Joanna supervises Marta and Ola. Past: 6 slots (Ola present on 6,
     * Marta on 5). Upcoming: 2 slots with 3 seats — one filled 2/3
     * (Marta + Ola), one empty.
     *
     * @param  array<string, User>  $users
     */
    private function seedSupervision(array $users): void
    {
        $joanna = $users['joanna'];

        foreach (['marta', 'ola'] as $key) {
            SupervisorAssignment::create([
                'volunteer_id' => $users[$key]->id,
                'supervisor_id' => $joanna->id,
                'assigned_at' => now()->subMonths(4),
            ]);
        }

        foreach (range(1, 6) as $number) {
            $slot = SupervisionSlot::create([
                'supervisor_id' => $joanna->id,
                'starts_at' => now()->subWeeks(13 - $number * 2)->setTime(17, 0),
                'duration_minutes' => 90,
                'seats_limit' => 3,
                'location_or_link' => 'Google Meet — link w kalendarzu',
            ]);

            SupervisionSignup::create([
                'slot_id' => $slot->id,
                'user_id' => $users['ola']->id,
                'signed_up_at' => $slot->starts_at->subDays(7),
                'attendance' => 'present',
                'attendance_marked_by' => $joanna->id,
            ]);

            if ($number <= 5) {
                SupervisionSignup::create([
                    'slot_id' => $slot->id,
                    'user_id' => $users['marta']->id,
                    'signed_up_at' => $slot->starts_at->subDays(6),
                    'attendance' => 'present',
                    'attendance_marked_by' => $joanna->id,
                ]);
            }
        }

        // Upcoming slot filled 2/3 (Marta's one upcoming signup + Ola).
        $upcoming = SupervisionSlot::create([
            'supervisor_id' => $joanna->id,
            'starts_at' => now()->addDays(9)->setTime(17, 0),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Google Meet — link w kalendarzu',
        ]);

        SupervisionSignup::create([
            'slot_id' => $upcoming->id,
            'user_id' => $users['marta']->id,
            'signed_up_at' => now()->subDays(2),
        ]);

        SupervisionSignup::create([
            'slot_id' => $upcoming->id,
            'user_id' => $users['ola']->id,
            'signed_up_at' => now()->subDays(1),
        ]);

        // Second upcoming slot — empty.
        SupervisionSlot::create([
            'supervisor_id' => $joanna->id,
            'starts_at' => now()->addDays(16)->setTime(17, 0),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Google Meet — link w kalendarzu',
        ]);
    }

    /**
     * Ola's graduation set: workshop, certificate NP/2026/001,
     * psychologist profile in `draft`, ready to submit.
     *
     * @param  array<string, User>  $users
     */
    private function seedOlaCompletion(array $users, Edition $edition): void
    {
        $ola = $users['ola'];

        WorkshopCompletion::create([
            'user_id' => $ola->id,
            'edition_id' => $edition->id,
            'completed_at' => now()->subMonths(1),
            'marked_by' => $users['opiekun']->id,
        ]);

        Certificate::create([
            'user_id' => $ola->id,
            'edition_id' => $edition->id,
            'number' => 'NP/2026/001',
            'issued_at' => $ola->program_completed_at,
            'pdf_path' => 'pdf/certificates/np-2026-001.html', // PdfService stub output
            'verification_token' => Str::random(40),
            'conditions_snapshot' => [
                'courses' => ['done' => 10, 'required' => 10],
                'internship' => ['done' => '72', 'required' => '72'],
                'supervision' => ['done' => 6, 'required' => 6],
                'workshop' => ['done' => true],
            ],
        ]);

        PsychologistProfile::create([
            'user_id' => $ola->id,
            'specializations' => ['wsparcie w kryzysie', 'praca z młodymi dorosłymi'],
            'approach' => 'poznawczo-behawioralny',
            'city' => 'Kraków',
            'bio' => 'Absolwentka programu PsychON. Doświadczenie w telefonicznej i czatowej pomocy wspierającej.',
            'status' => 'draft', // ready to submit — does not count towards the decision queue
        ]);
    }

    /**
     * Marta: 1 generated volunteer agreement + 3 notifications
     * (1 unread — internship.returned) with simulated e-mail copies.
     *
     * @param  array<string, User>  $users
     */
    private function seedMartaDocumentAndNotifications(array $users, Edition $edition): void
    {
        $marta = $users['marta'];

        Document::create([
            'user_id' => $marta->id,
            'edition_id' => $edition->id,
            'type' => 'volunteer_agreement',
            'number' => 'PW/2026/001',
            'data_snapshot' => [
                'first_name' => 'Marta',
                'last_name' => 'Demo',
                'edition' => 'Edycja 2026',
            ],
            'pdf_path' => 'pdf/documents/pw-2026-001.html', // PdfService stub output
            'generated_at' => now()->subMonths(2),
            'signature_status' => 'signed_offline',
        ]);

        $notifications = [
            [
                'type' => 'course.unlocked',
                'title' => 'Odblokowano etap 2: Wywiad psychologiczny',
                'body' => 'Ukończyłaś etap 1 i test wiedzy — możesz przejść do kolejnego etapu.',
                'link' => '/panel/kursy/wywiad-psychologiczny',
                'read_at' => now()->subDays(28),
                'created_at' => now()->subDays(29),
            ],
            [
                'type' => 'internship.accepted',
                'title' => 'Wpis stażu zaakceptowany',
                'body' => 'Opiekunka zaakceptowała Twój wpis z dziennika stażu.',
                'link' => '/panel/staz',
                'read_at' => now()->subDays(9),
                'created_at' => now()->subDays(10),
            ],
            [
                'type' => 'internship.returned',
                'title' => 'Wpis stażu zwrócony do poprawy',
                'body' => 'Uzupełnij formę dyżuru i doprecyzuj liczbę konsultacji, a potem wyślij wpis ponownie.',
                'link' => '/panel/staz',
                'read_at' => null, // the single unread one
                'created_at' => now()->subDays(3),
            ],
        ];

        foreach ($notifications as $data) {
            $notification = Notification::create([
                'user_id' => $marta->id,
                'type' => $data['type'],
                'title' => $data['title'],
                'body' => $data['body'],
                'link' => $data['link'],
                'read_at' => $data['read_at'],
                'created_at' => $data['created_at'],
                'updated_at' => $data['created_at'],
            ]);

            EmailMessage::create([
                'to_email' => $marta->email,
                'to_user_id' => $marta->id,
                'subject' => $data['title'],
                'body_html' => nl2br(e($data['body'])),
                'status' => 'simulated',
                'related_type' => $notification->getMorphClass(),
                'related_id' => $notification->id,
                'sent_at' => $data['created_at'],
                'created_at' => $data['created_at'],
                'updated_at' => $data['created_at'],
            ]);
        }
    }

    /**
     * 1 recruitment application with status `new` (queue counter = 1).
     */
    private function seedApplication(Edition $edition): void
    {
        Application::create([
            'edition_id' => $edition->id,
            'first_name' => 'Katarzyna',
            'last_name' => 'Przykładowa',
            'email' => 'kandydatka@example.test',
            'phone' => '+48 600 100 600',
            'source' => 'formularz Fundacji',
            'role' => 'volunteer',
            'payload' => [
                'motivation' => 'Chcę wspierać osoby w kryzysie i rozwijać kompetencje pomocowe.',
                'availability' => 'wieczory i weekendy',
            ],
            'university' => 'Uniwersytet Warszawski',
            'graduation_year' => 2025,
            'status' => 'new',
        ]);
    }

    /**
     * Terms & privacy consents for the demo accounts.
     *
     * @param  array<string, User>  $users
     */
    private function seedConsents(array $users): void
    {
        foreach (['marta', 'ola', 'filip', 'joanna'] as $key) {
            foreach (['regulamin', 'polityka'] as $type) {
                Consent::create([
                    'user_id' => $users[$key]->id,
                    'type' => $type,
                    'document_version' => 'v1',
                    'granted_at' => now()->subMonths(4),
                ]);
            }
        }
    }

    private function seedSettings(): void
    {
        Setting::create(['key' => 'sales_module_enabled', 'value' => 'false']);
        Setting::create(['key' => 'foundation_site_url', 'value' => 'https://niepodzielni.example']);
    }
}
