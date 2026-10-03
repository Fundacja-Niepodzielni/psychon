{{-- E-40. Konto zablokowane --}}
<x-email.layout
    subject="PsychON: konto zablokowane"
    reason="masz konto na platformie PsychON"
>
    <x-email.paragraph>
        Twoje konto na platformie PsychON zostało zablokowane.
    </x-email.paragraph>
    <x-email.next-steps>
        Jeśli masz pytania, skontaktuj się z Fundacją Niepodzielni: {{ $contact }}.
    </x-email.next-steps>
</x-email.layout>
