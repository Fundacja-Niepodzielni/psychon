{{-- E-09. Koniec prowadzenia kursu --}}
<x-email.layout
    subject="PsychON: koniec prowadzenia kursu"
    reason="masz konto Psychologa prowadzącego na platformie PsychON"
>
    <x-email.paragraph>
        Twoje przypisanie do kursu „{{ $courseTitle }}” (albo lekcji w tym kursie) zostało zdjęte.
        Nowe pytania do tego kursu nie będą już trafiać do Ciebie.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz kursy" path="/prowadzacy/kursy" />
</x-email.layout>
