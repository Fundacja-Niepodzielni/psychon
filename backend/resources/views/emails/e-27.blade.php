{{-- E-27. Termin superwizji odwołany — dla prowadzącego --}}
<x-email.layout
    subject="PsychON: Twój termin superwizji odwołany"
    reason="masz konto Psychologa prowadzącego na platformie PsychON"
>
    <x-email.paragraph>
        administracja odwołała Twój termin superwizji {{ $date }}, {{ $time }}. Osoby zapisane na
        ten termin dostały wiadomość.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz moją grupę" path="/prowadzacy/grupa" />
</x-email.layout>
