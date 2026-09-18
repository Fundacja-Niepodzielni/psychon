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
use Illuminate\Support\Facades\Storage;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
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
        'activation_token',
        'keycloak_sub',
        'pesel', // exposed explicitly by H01 for the owner/administration only
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'pesel' => 'encrypted',
            'address_street' => 'encrypted',
            'address_city' => 'encrypted',
            'address_zip' => 'encrypted',
            'access_expires_at' => 'datetime',
            'program_completed_at' => 'datetime',
            'last_login_at' => 'datetime',
            'anonymized_at' => 'datetime',
            'activation_confirmation_shown_at' => 'datetime',
        ];
    }

    public function fullName(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function isAnonymized(): bool
    {
        return $this->anonymized_at !== null;
    }

    /**
     * Konto jest powiązane z dostawcą tożsamości
     * (`sso/powiaz` albo polecenie operatora ustawia `keycloak_sub`) i
     * jednorazowy komunikat "Twoje konto zostało aktywowane" nie został
     * jeszcze odnotowany jako pokazany. Wywołujący MUSI przeczytać ten stan
     * PRZED wywołaniem `recordActivationConfirmationShown()` na tym samym
     * obiekcie — ta metoda odczytuje `activation_confirmation_shown_at`
     * z bieżącego stanu modelu, więc wywołana po zapisie zawsze zwróci
     * `false` (patrz kontroler, gdzie kolejność ma znaczenie).
     */
    public function shouldShowActivationConfirmation(): bool
    {
        return $this->keycloak_sub !== null && $this->activation_confirmation_shown_at === null;
    }

    /**
     * Odnotowuje pokazanie komunikatu. Idempotentne z konstrukcji: warunek
     * `whereNull` sprawia, że drugie (i setne) wywołanie nigdy nie nadpisuje
     * już zapisanej chwili — dotyczy zera wierszy. Zapis przez query builder,
     * nie `save()` na `$this`, żeby równoległe powtórzone żądanie też nie
     * mogło nadpisać znacznika.
     */
    public function recordActivationConfirmationShown(): void
    {
        if ($this->activation_confirmation_shown_at !== null) {
            return;
        }

        static::query()
            ->whereKey($this->id)
            ->whereNull('activation_confirmation_shown_at')
            ->update(['activation_confirmation_shown_at' => now()]);

        $this->refresh();
    }

    /**
     * @return BelongsTo<Edition, $this>
     */
    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }

    /**
     * @return HasMany<Consent, $this>
     */
    public function consents(): HasMany
    {
        return $this->hasMany(Consent::class);
    }

    /**
     * @return HasMany<LessonProgress, $this>
     */
    public function lessonProgress(): HasMany
    {
        return $this->hasMany(LessonProgress::class);
    }

    /**
     * @return HasMany<TestAttempt, $this>
     */
    public function testAttempts(): HasMany
    {
        return $this->hasMany(TestAttempt::class);
    }

    /**
     * @return HasMany<InternshipEntry, $this>
     */
    public function internshipEntries(): HasMany
    {
        return $this->hasMany(InternshipEntry::class);
    }

    /**
     * @return HasMany<SupervisionSignup, $this>
     */
    public function supervisionSignups(): HasMany
    {
        return $this->hasMany(SupervisionSignup::class);
    }

    /** Slots this user runs as a supervisor. */
    /**
     * @return HasMany<SupervisionSlot, $this>
     */
    public function supervisionSlots(): HasMany
    {
        return $this->hasMany(SupervisionSlot::class, 'supervisor_id');
    }

    /** Supervisor assignment history of this user as a volunteer. */
    /**
     * @return HasMany<SupervisorAssignment, $this>
     */
    public function supervisorAssignments(): HasMany
    {
        return $this->hasMany(SupervisorAssignment::class, 'volunteer_id');
    }

    /**
     * @return HasMany<WorkshopCompletion, $this>
     */
    public function workshopCompletions(): HasMany
    {
        return $this->hasMany(WorkshopCompletion::class);
    }

    /**
     * @return HasMany<Certificate, $this>
     */
    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    /**
     * @return HasMany<Document, $this>
     */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /**
     * @return HasOne<PsychologistProfile, $this>
     */
    public function psychologistProfile(): HasOne
    {
        return $this->hasOne(PsychologistProfile::class);
    }

    /**
     * @return HasOne<InstructorProfile, $this>
     */
    public function instructorProfile(): HasOne
    {
        return $this->hasOne(InstructorProfile::class);
    }

    /**
     * @return HasMany<Notification, $this>
     */
    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    /**
     * @return HasMany<InstructorQuestion, $this>
     */
    public function instructorQuestions(): HasMany
    {
        return $this->hasMany(InstructorQuestion::class);
    }

    /**
     * @return HasMany<DataExport, $this>
     */
    public function dataExports(): HasMany
    {
        return $this->hasMany(DataExport::class);
    }

    /**
     * `data_exports.user_id`
     * ma `cascadeOnDelete()` (migration 2026_01_02_000000), więc `forceDelete()`
     * usuwa wiersze eksportu razem z kontem — ale kaskada bazy nie wie nic o
     * pliku na dysku (`local`/exports/…json). Bez tego haka fizyczna paczka
     * z kompletem danych osobowych zostaje na zawsze, mimo że ślad w bazie
     * znika. `forceDeleting` odpala się, zanim DB wykona kaskadę, więc
     * `dataExports()` jest tu jeszcze czytelne.
     */
    protected static function booted(): void
    {
        static::forceDeleting(function (self $user): void {
            $user->dataExports()->whereNotNull('file_path')->get()
                ->each(function (DataExport $export): void {
                    Storage::disk('local')->delete($export->file_path);
                });
        });
    }
}
