{{-- E-02. Decyzja: zgłoszenie odrzucone --}}
<x-email.layout
    subject="PsychON: decyzja w sprawie zgłoszenia"
    reason="ten adres e-mail podano w zgłoszeniu do programu PsychON"
>
    <x-email.paragraph>
        dziękujemy za zgłoszenie do programu PsychON. Po rozpatrzeniu zgłoszenia nie możemy
        zaproponować udziału w programie.
    </x-email.paragraph>
    <x-email.details :rows="[
        ['Powód', $reason],
    ]" />
</x-email.layout>
