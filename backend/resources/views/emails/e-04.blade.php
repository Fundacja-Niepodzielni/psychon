{{-- E-04. Potwierdzenie zgłoszenia pomocy --}}
<x-email.layout
    :subject="'PsychON: przyjęliśmy zgłoszenie '.$reference"
    reason="z Twojego konta wysłano zgłoszenie z okna pomocy w panelu PsychON"
>
    <x-email.paragraph>
        dziękujemy za zgłoszenie. Ma numer {{ $reference }}. Odpowiemy najszybciej, jak to możliwe.
    </x-email.paragraph>
    <x-email.details :rows="[
        ['Treść zgłoszenia', $content],
    ]" />
</x-email.layout>
