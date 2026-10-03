{{-- E-01. Zaproszenie do programu --}}
<x-email.layout
    subject="PsychON: zaproszenie do programu"
    reason="ten adres e-mail podano w zgłoszeniu do programu PsychON"
>
    <x-email.paragraph>
        Twoje zgłoszenie do programu PsychON zostało zatwierdzone. Możesz już zacząć.
    </x-email.paragraph>
    <x-email.next-steps>
        Otwórz odnośnik poniżej i zaloguj się przez Konta Niepodzielni. Jeśli nie masz jeszcze konta
        w Kontach Niepodzielni, załóż je na ten sam adres e-mail, na który przyszła ta wiadomość, i
        potwierdź adres odnośnikiem, który przyśle Konta Niepodzielni.
    </x-email.next-steps>
    <x-email.button-row label="Aktywuj dostęp" :path="$activationPath" />
</x-email.layout>
