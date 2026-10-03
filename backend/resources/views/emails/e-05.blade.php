{{-- E-05. Zgłoszenie pomocy — kopia dla zespołu --}}
<x-email.layout
    :subject="'PsychON: zgłoszenie pomocy '.$reference"
    reason="ten adres jest skrzynką zespołu pomocy PsychON"
>
    <x-email.paragraph>
        w oknie pomocy w panelu PsychON wpłynęło nowe zgłoszenie.
    </x-email.paragraph>
    <x-email.details :rows="[
        ['Numer zgłoszenia', $reference],
        ['Imię i nazwisko', $requesterName],
        ['Adres e-mail', $requesterEmail, 'mailto'],
        ['Rola osoby zgłaszającej', $role],
        ['Ekran, z którego wysłano zgłoszenie', $screen],
        ['Treść zgłoszenia', $content],
    ]" />
</x-email.layout>
