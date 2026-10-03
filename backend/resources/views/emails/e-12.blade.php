{{-- E-12. Nowe pytanie do lekcji --}}
<x-email.layout
    subject="PsychON: nowe pytanie do lekcji"
    reason="masz konto Psychologa prowadzącego na platformie PsychON"
>
    <x-email.paragraph>
        pojawiło się nowe pytanie do lekcji „{{ $lessonTitle }}”. Treść pytania przeczytasz w
        panelu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz pytania" path="/prowadzacy/pytania" />
</x-email.layout>
