{{-- E-25. Przypomnienie: jutro superwizja --}}
<x-email.layout
    subject="PsychON: jutro superwizja"
    reason="masz konto na platformie PsychON i zapis na ten termin"
>
    <x-email.paragraph>
        przypominamy: jutro, {{ $date }} o {{ $time }}, masz superwizję. Szczegóły terminu
        znajdziesz w panelu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz superwizję" path="/panel/superwizja" />
</x-email.layout>
