{{-- E-31. Zapowiedź usunięcia danych nieaktywnego konta --}}
<x-email.layout
    subject="PsychON: usunięcie danych z nieaktywnego konta"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        Twoje konto na platformie PsychON jest nieaktywne od ponad roku. {{ $deletionDate }}
        usuniemy z niego Twoje dane osobowe, zgodnie z zasadami przechowywania danych Fundacji
        Niepodzielni.
    </x-email.paragraph>
    <x-email.next-steps>
        Jeśli chcesz zachować konto, skontaktuj się z Fundacją: {{ $contact }}.
    </x-email.next-steps>
</x-email.layout>
