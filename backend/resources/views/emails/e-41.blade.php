{{-- E-41. Pytanie do lekcji bez prowadzącego --}}
<x-email.layout
    subject="PsychON: pytanie do lekcji bez prowadzącego"
    reason="masz w PsychON rolę Opiekun Projektu albo Super Admin"
>
    <x-email.paragraph>
        pojawiło się pytanie do lekcji „{{ $lessonTitle }}” w kursie „{{ $courseTitle }}”, ale ten
        kurs nie ma przypisanego prowadzącego. Przypisz prowadzącego, żeby pytanie trafiło do
        odpowiedniej osoby.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz kursy" path="/admin/kursy" />
</x-email.layout>
