<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'password',
        'phone',
        'address_street',
        'address_city',
        'address_zip',
        'pesel',
        'role',
        'status',
        'edition_id',
        'access_expires_at',
        'program_completed_at',
        'product_group',
        'last_login_at',
        'activation_token',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'activation_token',
        'pesel', // exposed explicitly by H01 for the owner/administration only
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'pesel' => 'encrypted',
            'address_street' => 'encrypted',
            'address_city' => 'encrypted',
            'address_zip' => 'encrypted',
            'access_expires_at' => 'datetime',
            'program_completed_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }

    public function consents(): HasMany
    {
        return $this->hasMany(Consent::class);
    }

    public function lessonProgress(): HasMany
    {
        return $this->hasMany(LessonProgress::class);
    }

    public function testAttempts(): HasMany
    {
        return $this->hasMany(TestAttempt::class);
    }

    public function internshipEntries(): HasMany
    {
        return $this->hasMany(InternshipEntry::class);
    }

    public function supervisionSignups(): HasMany
    {
        return $this->hasMany(SupervisionSignup::class);
    }

    /** Slots this user runs as a supervisor. */
    public function supervisionSlots(): HasMany
    {
        return $this->hasMany(SupervisionSlot::class, 'supervisor_id');
    }

    /** Supervisor assignment history of this user as a volunteer. */
    public function supervisorAssignments(): HasMany
    {
        return $this->hasMany(SupervisorAssignment::class, 'volunteer_id');
    }

    public function workshopCompletions(): HasMany
    {
        return $this->hasMany(WorkshopCompletion::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    public function psychologistProfile(): HasOne
    {
        return $this->hasOne(PsychologistProfile::class);
    }

    public function instructorProfile(): HasOne
    {
        return $this->hasOne(InstructorProfile::class);
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function instructorQuestions(): HasMany
    {
        return $this->hasMany(InstructorQuestion::class);
    }
}
