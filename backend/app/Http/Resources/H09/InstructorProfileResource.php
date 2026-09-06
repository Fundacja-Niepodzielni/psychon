<?php

namespace App\Http\Resources\H09;

use App\Models\Course;
use App\Models\InstructorProfile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Wizytówka prowadzącego — bez danych wrażliwych (bez email, PESEL, adresu).
 * `id` = identyfikator użytkownika prowadzącego (spójnie z `data.instructor.id`
 * w GET /courses/{slug}); `courses` przekazywane z zewnątrz, żeby lista wizytówek
 * liczyła je jednym zapytaniem.
 *
 * @mixin InstructorProfile
 */
class InstructorProfileResource extends JsonResource
{
    /**
     * @param  InstructorProfile  $resource
     * @param  Collection<int, Course>  $courses
     */
    public function __construct(
        $resource,
        private readonly Collection $courses,
        private readonly bool $withSupervisor = false,
    ) {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $user = $this->user;

        $data = [
            'id' => (int) $user->id,
            'user_id' => (int) $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'city' => $this->city,
            'specializations' => $this->specializations ?? [],
            'bio' => $this->bio,
            'experience' => $this->experience,
            'responsibilities' => $this->responsibilities ?? [],
            'courses' => $this->courses
                ->map(fn (Course $course): array => [
                    'id' => (int) $course->id,
                    'slug' => $course->slug,
                    'title' => $course->title,
                    'sequence_order' => $course->sequence_order,
                ])
                ->values()
                ->all(),
        ];

        if ($this->withSupervisor) {
            $supervisor = $this->supervisor;
            $data['supervisor'] = $supervisor !== null
                ? ['id' => (int) $supervisor->id, 'name' => $supervisor->fullName()]
                : null;
        }

        return $data;
    }
}
