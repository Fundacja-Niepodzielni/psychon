{{-- E-19. Dokument gotowy --}}
<x-email.layout
    subject="PsychON: dokument gotowy do pobrania"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        {{ $documentKind }} jest gotowe do pobrania w panelu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz dokumenty" path="/panel/dokumenty" />
</x-email.layout>
