{{-- E-22. Wycofana zgoda na publikację profilu --}}
<x-email.layout
    subject="PsychON: wycofana zgoda na publikację profilu"
    reason="masz w PsychON rolę, która prowadzi bazę psychologów"
>
    <x-email.paragraph>
        osoba z bazy psychologów wycofała zgodę na publikację swojego profilu psychologa. Profil
        trzeba zdjąć ze strony Fundacji.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz profile psychologa" path="/admin/profile" />
</x-email.layout>
