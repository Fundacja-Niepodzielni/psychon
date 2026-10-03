{{-- E-29. Dostęp kończy się za 7 dni --}}
<x-email.layout
    subject="PsychON: dostęp kończy się za 7 dni"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        za 7 dni kończy się Twój dostęp do materiałów programu PsychON. Datę końca dostępu i swoje
        postępy zobaczysz w panelu.
    </x-email.paragraph>
    <x-email.next-steps>
        Jeśli potrzebujesz więcej czasu, napisz do Fundacji przez okno „Potrzebujesz pomocy?” w
        panelu PsychON. Okno pomocy działa także po zakończeniu dostępu.
    </x-email.next-steps>
    <x-email.button-row label="Otwórz profil" path="/panel/profil" />
</x-email.layout>
