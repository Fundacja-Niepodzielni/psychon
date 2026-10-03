{{-- E-03. Zaproszenie do konta założonego przez administrację --}}
<x-email.layout
    subject="PsychON: zaproszenie na platformę"
    reason="Fundacja Niepodzielni założyła konto na ten adres e-mail"
>
    <x-email.paragraph>
        Fundacja Niepodzielni założyła dla Ciebie konto na platformie PsychON. Możesz już zacząć.
    </x-email.paragraph>
    <x-email.next-steps>
        Otwórz odnośnik poniżej i zaloguj się przez Konta Niepodzielni. Jeśli nie masz jeszcze konta
        w Kontach Niepodzielni, załóż je na ten sam adres e-mail, na który przyszła ta wiadomość, i
        potwierdź adres odnośnikiem, który przyśle Konta Niepodzielni.
    </x-email.next-steps>
    <x-email.button-row label="Aktywuj dostęp" :path="$activationPath" />
</x-email.layout>
