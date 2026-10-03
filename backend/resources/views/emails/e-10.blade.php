{{-- E-10. Zaproszenie na kurs --}}
<x-email.layout
    subject="PsychON: zaproszenie na kurs"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        zapraszamy Cię na kurs „{{ $courseTitle }}”. Szczegóły i materiały są na stronie kursu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz kurs" :path="$path" />
</x-email.layout>
