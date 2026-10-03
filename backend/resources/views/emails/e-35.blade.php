{{-- E-35. Nowe podejścia do testu --}}
<x-email.layout
    subject="PsychON: możesz ponownie podejść do testu"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        możesz ponownie podejść do testu etapu „{{ $stageTitle }}”.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz etap" :path="$path" />
</x-email.layout>
