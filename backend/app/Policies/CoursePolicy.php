<?php

namespace App\Policies;

use App\Models\Course;
use App\Models\User;
use App\Services\Auth\TokenRoles;

/**
 * Prowadzący edytuje treść tylko kursu, do którego jest przypisany — aktywne
 * przypisanie na poziomie kursu (`course_assignments` z `lesson_id = null`
 * i `unassigned_at = null`), ta sama definicja co lista własnych kursów
 * (`App\Services\H09\InstructorCourses`).
 *
 * Rola czytana z tokenu (`TokenRoles`), nigdy z kolumny `users.role` — jak
 * w `DocumentPolicy`. Administracja ma osobne trasy `/admin/...` i celowo
 * nie dostaje tu żadnego automatycznego przejścia: rolę i tak odcina
 * middleware `role:instructor` na trasach `/instructor/*`, ale sama
 * polityka nie zakłada niczego o wywołującym poza przypisaniem.
 */
class CoursePolicy
{
    public function __construct(private readonly TokenRoles $tokenRoles) {}

    public function update(User $user, Course $course): bool
    {
        if (! $this->tokenRoles->has('instructor')) {
            return false;
        }

        return $course->assignments()
            ->where('instructor_id', $user->id)
            ->whereNull('lesson_id')
            ->whereNull('unassigned_at')
            ->exists();
    }
}
