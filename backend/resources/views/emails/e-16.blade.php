{{-- E-16. Wpis stażu odrzucony --}}
<x-email.layout
    subject="PsychON: wpis stażu odrzucony"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        Twój wpis stażu został odrzucony. Szczegóły znajdziesz w dzienniku stażu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz dziennik stażu" path="/panel/staz" />
</x-email.layout>
