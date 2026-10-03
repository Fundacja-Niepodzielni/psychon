{{-- E-14. Wpis stażu zatwierdzony --}}
<x-email.layout
    subject="PsychON: wpis stażu zatwierdzony"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        Twój wpis stażu został zatwierdzony. Jego godziny liczą się już do stażu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz dziennik stażu" path="/panel/staz" />
</x-email.layout>
