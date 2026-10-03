{{-- E-17. Wyczerpane podejścia do testu --}}
<x-email.layout
    subject="PsychON: wyczerpane podejścia do testu"
    reason="masz w PsychON rolę Opiekun Projektu albo Super Admin"
>
    <x-email.paragraph>
        osoba uczestnicząca w programie wykorzystała wszystkie podejścia do testu etapu „{{
        $stageTitle }}” bez zaliczenia. Na karcie osoby możesz odnowić limit podejść.
    </x-email.paragraph>
    <x-email.button-row label="Otwórz kartę osoby" :path="$path" />
</x-email.layout>
