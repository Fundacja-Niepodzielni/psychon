{{-- E-15. Prośba o poprawkę wpisu stażu --}}
<x-email.layout
    subject="PsychON: prośba o poprawkę wpisu stażu"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        administracja prosi o poprawkę Twojego wpisu stażu. Komentarz i wpis znajdziesz w dzienniku
        stażu.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz dziennik stażu" path="/panel/staz" />
</x-email.layout>
