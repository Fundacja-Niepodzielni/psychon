<?php

namespace App\Support\Emails;

use App\Console\Commands\CheckExpiredAccess;
use App\Http\Controllers\Api\V1\Admin\AdminUserController;
use App\Mail\HelpMessageConfirmation;
use App\Mail\HelpMessageReceived;
use App\Services\H03\ApplicationInvitationMailer;
use App\Services\H03\ApplicationRejectionMailer;
use InvalidArgumentException;

/**
 * Registry: notification type or direct mail → e-mail number → template.
 *
 * Numbers are the ones of the approved content (`E-01` … `E-41`); each has
 * one Blade template `resources/views/emails/e-NN.blade.php`, built only from
 * the blocks in `resources/views/components/email/`.
 *
 * Every type in `NotificationTypes::ALL` is either in `NOTIFICATIONS` or in
 * `BELL_ONLY` (guarded by `tests/Feature/Emails/EmailRegistryTest`). A type is
 * bell only exactly when the approved content has no e-mail for it.
 */
final class EmailTemplates
{
    /** „Wychodzi zawsze” — nobody can switch the e-mail off. */
    public const string ALWAYS = 'always';

    /** „Wyłącza tylko administracja” — only the whole type, in the settings. */
    public const string ADMIN = 'admin';

    /** „Osoba może wyłączyć w Profilu” — the person can switch off the e-mail; the bell stays. */
    public const string PERSON = 'person';

    /**
     * number => who can switch it off, whether it goes to the Foundation's own
     * team (no „Kontakt z Fundacją” line), and the data the template needs.
     *
     * @var array<string, array{switch: string, team: bool, requires: list<string>}>
     */
    public const array TEMPLATES = [
        'E-01' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => ['activationPath']],
        'E-02' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => ['reason']],
        'E-03' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => ['activationPath']],
        'E-04' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => ['reference', 'content']],
        'E-05' => ['switch' => self::ALWAYS, 'team' => true, 'requires' => ['reference', 'requesterName', 'requesterEmail', 'role', 'screen', 'content']],
        'E-08' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['courseTitle']],
        'E-09' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['courseTitle']],
        'E-10' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['courseTitle', 'path']],
        'E-11' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['stageNumber', 'stageTitle', 'path']],
        'E-12' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['lessonTitle']],
        'E-13' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['lessonTitle', 'path']],
        'E-14' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-15' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-16' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-17' => ['switch' => self::PERSON, 'team' => true, 'requires' => ['stageTitle', 'path']],
        'E-18' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-19' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['documentKind']],
        'E-20' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-21' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-22' => ['switch' => self::PERSON, 'team' => true, 'requires' => []],
        'E-23' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-24' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-25' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['date', 'time']],
        'E-26' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['date', 'time']],
        'E-27' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['date', 'time']],
        'E-29' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-30' => ['switch' => self::ADMIN, 'team' => false, 'requires' => []],
        'E-31' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => ['deletionDate']],
        'E-32' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-33' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-34' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-35' => ['switch' => self::PERSON, 'team' => false, 'requires' => ['stageTitle', 'path']],
        'E-36' => ['switch' => self::PERSON, 'team' => false, 'requires' => []],
        'E-37' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => []],
        'E-38' => ['switch' => self::ADMIN, 'team' => false, 'requires' => ['documentName', 'path']],
        'E-39' => ['switch' => self::PERSON, 'team' => true, 'requires' => []],
        'E-40' => ['switch' => self::ALWAYS, 'team' => false, 'requires' => []],
        'E-41' => ['switch' => self::PERSON, 'team' => true, 'requires' => ['lessonTitle', 'courseTitle']],
    ];

    /**
     * Notification type => its e-mails. The first one is used unless the
     * caller names another one from the same list (`email: ['template' => …]`).
     *
     * @var array<string, list<string>>
     */
    public const array NOTIFICATIONS = [
        'assignment.created' => ['E-08'],
        'assignment.removed' => ['E-09'],
        'course.invited' => ['E-10'],
        'course.unlocked' => ['E-11'],
        // E-41: the lesson and its course have no instructor — the team gets it.
        'question.asked' => ['E-12', 'E-41'],
        'question.answered' => ['E-13'],
        'internship.accepted' => ['E-14'],
        'internship.returned' => ['E-15'],
        'internship.rejected' => ['E-16'],
        'attempt.failed_final' => ['E-17'],
        'certificate.ready' => ['E-18'],
        'document.ready' => ['E-19'],
        'profile.accepted' => ['E-20'],
        'profile.returned' => ['E-21'],
        'profile.withdrawn' => ['E-22'],
        'export.ready' => ['E-23'],
        'cooperation_request.answered' => ['E-24'],
        'supervision.reminder' => ['E-25'],
        'supervision.slot_cancelled' => ['E-26', 'E-27'],
        'access.expiring_7d' => ['E-29'],
        'access.expired' => ['E-30'],
        'cooperation_request.created' => ['E-39'],
    ];

    /**
     * `email: ['template' => EmailTemplates::NONE]` — bell only for this one
     * call (E-08 is not sent when the instructor created the course).
     */
    public const string NONE = 'none';

    /**
     * Bell only, no e-mail: the approved content removed these e-mails.
     *
     * @var array<string, string>
     */
    public const array BELL_ONLY = [
        // E-06: the person gets the invitation E-01 at the same moment.
        'application.accepted' => 'E-06',
        // E-07: the person who rejected knows the decision; E-02 goes to the candidate.
        'application.rejected' => 'E-07',
        // E-28: chat messages notify only with the bell.
        'message.received' => 'E-28',
    ];

    /**
     * Mails sent outside the notification bus (E-31 and E-40 go only to the
     * outbox, like E-03).
     *
     * @var array<string, string>
     */
    public const array MAILS = [
        ApplicationInvitationMailer::class => 'E-01',
        ApplicationRejectionMailer::class => 'E-02',
        AdminUserController::class => 'E-03',
        HelpMessageConfirmation::class => 'E-04',
        HelpMessageReceived::class => 'E-05',
        CheckExpiredAccess::class => 'E-31',
        AdminUserController::class.'::block' => 'E-40',
    ];

    public static function view(string $number): string
    {
        self::assertKnown($number);

        return 'emails.'.strtolower($number);
    }

    public static function isTeam(string $number): bool
    {
        self::assertKnown($number);

        return self::TEMPLATES[$number]['team'];
    }

    public static function switchMode(string $number): string
    {
        self::assertKnown($number);

        return self::TEMPLATES[$number]['switch'];
    }

    /**
     * Whether this registry decides about the e-mail copy of the type.
     */
    public static function covers(string $type): bool
    {
        return array_key_exists($type, self::NOTIFICATIONS) || array_key_exists($type, self::BELL_ONLY);
    }

    public static function isBellOnly(string $type): bool
    {
        return array_key_exists($type, self::BELL_ONLY);
    }

    /**
     * Whether the person can switch off the e-mail of this type for
     * themselves („Osoba może wyłączyć w Profilu”); the bell stays.
     */
    public static function personSwitchable(string $type): bool
    {
        $numbers = self::NOTIFICATIONS[$type] ?? [];

        return $numbers !== [] && array_all(
            $numbers,
            fn (string $number): bool => self::TEMPLATES[$number]['switch'] === self::PERSON,
        );
    }

    /**
     * The e-mail of a notification type; `$template` picks one of the type's
     * own e-mails and never one of another type, or `NONE` for no e-mail.
     */
    public static function forNotification(string $type, ?string $template = null): ?string
    {
        $numbers = self::NOTIFICATIONS[$type] ?? throw new InvalidArgumentException("No e-mail for notification type {$type}.");

        if ($template === self::NONE) {
            return null;
        }

        if ($template === null) {
            return $numbers[0];
        }

        if (! in_array($template, $numbers, true)) {
            throw new InvalidArgumentException("E-mail {$template} does not belong to notification type {$type}.");
        }

        return $template;
    }

    /**
     * Keys the template needs and the data does not carry.
     *
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    public static function missing(string $number, array $data): array
    {
        self::assertKnown($number);

        return array_values(array_filter(
            self::TEMPLATES[$number]['requires'],
            fn (string $key): bool => ! isset($data[$key]) || $data[$key] === '',
        ));
    }

    private static function assertKnown(string $number): void
    {
        if (! array_key_exists($number, self::TEMPLATES)) {
            throw new InvalidArgumentException("Unknown e-mail {$number}.");
        }
    }
}
