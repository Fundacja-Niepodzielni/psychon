{{-- E-23. Eksport danych gotowy --}}
<x-email.layout
    subject="PsychON: eksport Twoich danych jest gotowy"
    reason="z Twojego konta poproszono o eksport danych"
>
    <x-email.paragraph>
        plik z Twoimi danymi osobowymi jest gotowy do pobrania. Plik jest dostępny przez ograniczony
        czas.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz profil" path="/panel/profil" />
</x-email.layout>
