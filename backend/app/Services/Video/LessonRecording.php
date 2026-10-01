<?php

namespace App\Services\Video;

use App\Models\Lesson;
use DateTimeInterface;

/**
 * Nagranie lekcji odczytane z bazy — bez żadnego żądania do dostawcy.
 *
 * Lekcja może mieć dwa nagrania naraz:
 *  - ODTWARZANE (`video_provider_id`) — to, do którego uczestnik dostaje link;
 *  - „W DRODZE” (`video_pending_id`) — wysyłane albo przetwarzane; zastąpi
 *    odtwarzane dopiero wtedy, gdy będzie gotowe.
 *
 * Kolumna stanu (`video_status`) opisuje NAJNOWSZE nagranie: „w drodze”, jeśli
 * jest, a w przeciwnym razie odtwarzane. Pusty stan przy lekcji z samym
 * identyfikatorem odtwarzanym znaczy „stan nieznany” (lekcja sprzed tej
 * kolumny albo identyfikator wpisany ręcznie): takie nagranie jest wydawane
 * jak dotąd, a stan ustala pierwszy odczyt stanu przez administrację.
 *
 * Gdy lekcja ma oba nagrania, odtwarzane jest gotowe: rozpoczęcie wgrania
 * zostawia identyfikator odtwarzany tylko wtedy, gdy da się go odtworzyć
 * (patrz `BunnyVideoAdminController::createUpload`).
 *
 * Identyfikator spoza wzorca `VideoProviderId` jest traktowany jak brak
 * nagrania — tak samo jak w całej reszcie kodu nagrań.
 */
final class LessonRecording
{
    /** Okno, w którym niedokończoną wysyłkę wolno wznowić dla tego samego nagrania. */
    public const int RESUME_WINDOW_SECONDS = 21600;

    public readonly ?string $playedId;

    public readonly ?string $pendingId;

    public readonly ?DateTimeInterface $statusAt;

    private readonly ?string $storedStatus;

    public function __construct(mixed $playedId, mixed $pendingId, mixed $storedStatus, ?DateTimeInterface $statusAt)
    {
        $this->playedId = VideoProviderId::isValid($playedId) ? $playedId : null;
        $this->pendingId = VideoProviderId::isValid($pendingId) ? $pendingId : null;
        $this->statusAt = $statusAt;
        $this->storedStatus = is_string($storedStatus)
            && $storedStatus !== RecordingStatus::NONE
            && in_array($storedStatus, RecordingStatus::ALL, true)
                ? $storedStatus
                : null;
    }

    public static function of(Lesson $lesson): self
    {
        return new self(
            $lesson->video_provider_id,
            $lesson->video_pending_id,
            $lesson->video_status,
            $lesson->video_status_at,
        );
    }

    public function hasPending(): bool
    {
        return $this->pendingId !== null;
    }

    /**
     * Identyfikator nagrania, które opisuje kolumna stanu: „w drodze”, a gdy
     * go nie ma — odtwarzane. `null` = lekcja bez nagrania.
     */
    public function newestId(): ?string
    {
        return $this->pendingId ?? $this->playedId;
    }

    /**
     * Stan najnowszego nagrania. `none` dla lekcji bez nagrania; `null` =
     * stan nieznany (jest identyfikator odtwarzany, stanu nikt jeszcze nie
     * ustalił).
     */
    public function status(): ?string
    {
        if ($this->newestId() === null) {
            return RecordingStatus::NONE;
        }

        if ($this->pendingId !== null) {
            return $this->storedStatus ?? RecordingStatus::UPLOADING;
        }

        return $this->storedStatus;
    }

    /**
     * Czy lekcja ma nagranie, które uczestnik może odtworzyć: identyfikator
     * odtwarzany w stanie „gotowe” albo „nieznany”, także wtedy, gdy obok
     * jest już nowe nagranie „w drodze”.
     */
    public function hasPlayable(): bool
    {
        if ($this->playedId === null) {
            return false;
        }

        if ($this->pendingId !== null) {
            return true;
        }

        return $this->storedStatus === null || $this->storedStatus === RecordingStatus::READY;
    }

    /**
     * Stan dla uczestnika: `ready` wtedy i tylko wtedy, gdy link do nagrania
     * zostanie wydany; w przeciwnym razie stan najnowszego nagrania.
     */
    public function participantStatus(): string
    {
        if ($this->hasPlayable()) {
            return RecordingStatus::READY;
        }

        return $this->status() ?? RecordingStatus::PROCESSING;
    }

    /**
     * Czy przy odczycie stanu wolno zapytać dostawcę (o próg czasu dba
     * `RecordingStateRefresher`).
     */
    public function asksProvider(): bool
    {
        return $this->newestId() !== null && RecordingStatus::asksProvider($this->status());
    }

    /**
     * Czy ponowne uprawnienie do wysyłki ma dotyczyć TEGO SAMEGO nagrania:
     * jest nagranie „w drodze”, dostawca nie zgłosił jeszcze pliku (stan
     * „wysyłanie”) i od założenia nagrania minęło mniej niż sześć godzin.
     */
    public function resumable(DateTimeInterface $now): bool
    {
        if ($this->pendingId === null || $this->status() !== RecordingStatus::UPLOADING || $this->statusAt === null) {
            return false;
        }

        $age = $now->getTimestamp() - $this->statusAt->getTimestamp();

        return $age >= 0 && $age < self::RESUME_WINDOW_SECONDS;
    }
}
