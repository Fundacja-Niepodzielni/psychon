<?php

namespace App\Support;

/**
 * Every notification type the application sends through `Notify::send`.
 * Notification preferences are stored per type from this list, so a new
 * `Notify::send` type must be added here (guarded by
 * `tests/Unit/NotificationTypesRegistryTest`).
 */
final class NotificationTypes
{
    public const array ALL = [
        'application.accepted',
        'application.rejected',
        'assignment.created',
        'assignment.removed',
        'attempt.failed_final',
        'certificate.ready',
        'cooperation_request.answered',
        'course.invited',
        'course.unlocked',
        'document.ready',
        'export.ready',
        'internship.accepted',
        'internship.rejected',
        'internship.returned',
        'message.received',
        'profile.accepted',
        'profile.returned',
        'profile.withdrawn',
        'question.answered',
        'question.asked',
        'supervision.reminder',
        'supervision.slot_cancelled',
        'thread.member_added',
    ];
}
