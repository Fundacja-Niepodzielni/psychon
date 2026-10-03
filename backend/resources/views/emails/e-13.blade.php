{{-- E-13. Odpowiedź na pytanie --}}
<x-email.layout
    subject="PsychON: odpowiedź na Twoje pytanie"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        na Twoje pytanie do lekcji „{{ $lessonTitle }}” jest już odpowiedź. Przeczytasz ją w panelu,
        przy lekcji.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz kurs" :path="$path" />
</x-email.layout>
