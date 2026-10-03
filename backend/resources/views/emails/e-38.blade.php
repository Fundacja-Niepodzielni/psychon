{{-- E-38. Nowa wersja dokumentu do akceptacji --}}
<x-email.layout
    subject="PsychON: nowa wersja dokumentu"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        opublikowaliśmy nową wersję dokumentu „{{ $documentName }}”. Przeczytaj ją i potwierdź po
        zalogowaniu.
    </x-email.paragraph>
    <x-email.button-row label="Przeczytaj dokument" :path="$path" />
</x-email.layout>
