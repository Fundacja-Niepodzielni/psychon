<?php

namespace App\Services\H08;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;

/**
 * Zakładający kurs (`POST /instructor/courses`) zostaje od razu jego
 * prowadzącym — TĄ SAMĄ ścieżką przypisań co administracja
 * (`Http\Controllers\Api\V1\H09\CourseAssignmentController::store`): ten sam
 * model (`CourseAssignment`), ten sam slug audytu (`assignment.created`,
 * kontrakt §3.2) i ten sam typ powiadomienia (`assignment.created`,
 * kontrakt §3.1) — bez nowego kodu błędu, sluga audytu ani typu
 * powiadomienia. Kurs świeżo założony nie ma jeszcze żadnego przypisania,
 * więc pomijamy tu wyłącznie stąd kontrolę konfliktu z H09 (dotyczy
 * WYŁĄCZNIE kursu z istniejącym aktywnym przypisaniem) — nie duplikuje ona
 * żadnej reguły domenowej, bo dla nowego kursu nie może się zdarzyć.
 */
final class InstructorCourseAssignment
{
    public static function assignCreator(Course $course, User $instructor): CourseAssignment
    {
        $assignment = CourseAssignment::query()->create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_by' => $instructor->id,
            'assigned_at' => now(),
        ])->load('instructor');

        AuditLog::record($instructor, 'assignment.created', $assignment, [
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
        ]);

        Notify::send(
            $instructor,
            'assignment.created',
            'Przypisano Cię jako prowadzącego',
            "Zostałeś przypisany jako prowadzący kursu „{$course->title}”.",
            '/panel/prowadzacy',
            email: ['courseTitle' => $course->title],
        );

        return $assignment;
    }
}
