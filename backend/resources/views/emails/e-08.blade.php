{{-- E-08. Nowy kurs do prowadzenia --}}
<x-email.layout
    subject="PsychON: nowy kurs do prowadzenia"
    reason="masz konto Psychologa prowadzącego na platformie PsychON"
>
    <x-email.paragraph>
        masz nowe przypisanie: kurs „{{ $courseTitle }}” (albo lekcja w tym kursie). Pytania
        uczestników do tego kursu trafią teraz do Ciebie.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz kursy" path="/prowadzacy/kursy" />
</x-email.layout>
