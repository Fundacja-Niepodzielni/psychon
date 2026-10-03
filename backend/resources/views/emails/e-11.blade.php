{{-- E-11. Nowy etap dostępny --}}
<x-email.layout
    subject="PsychON: nowy etap dostępny"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        poprzedni etap jest ukończony. Możesz już zacząć etap {{ $stageNumber }}: „{{ $stageTitle
        }}”.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz etap" :path="$path" />
</x-email.layout>
