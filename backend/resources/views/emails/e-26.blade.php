{{-- E-26. Termin superwizji odwołany --}}
<x-email.layout
    subject="PsychON: termin superwizji odwołany"
    reason="masz konto na platformie PsychON i zapis na ten termin"
>
    <x-email.paragraph>
        termin superwizji {{ $date }}, {{ $time }} został odwołany. Możesz zapisać się na inny
        termin.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz superwizję" path="/panel/superwizja" />
</x-email.layout>
