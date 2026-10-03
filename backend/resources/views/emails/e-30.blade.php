{{-- E-30. Dostęp się zakończył --}}
<x-email.layout
    subject="PsychON: dostęp do materiałów się zakończył"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        Twój dostęp do materiałów programu PsychON zakończył się.
    </x-email.paragraph>
    <x-email.next-steps>
        Jeśli chcesz dokończyć program, napisz do Fundacji przez okno „Potrzebujesz pomocy?” w
        panelu PsychON. Okno pomocy działa także po zakończeniu dostępu.
        @if ($hasContact)
            Możesz też skontaktować się z Fundacją: {{ $contact }}.
        @endif
    </x-email.next-steps>
    <x-email.button-row label="Otwórz PsychON" path="/dostep-wygasl" />
</x-email.layout>
