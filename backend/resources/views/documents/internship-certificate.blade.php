<!doctype html>
<html lang="pl">
<head>
    <meta charset="utf-8">
    <title>Zaświadczenie o stażu {{ $number ?? '' }}</title>
    <style>
        body { font-family: sans-serif; font-size: 14px; color: #111; margin: 40px; }
        h1 { font-size: 18px; }
        .meta { color: #555; margin-bottom: 24px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
        td { padding: 4px 8px; vertical-align: top; }
        td.label { color: #555; width: 220px; }
        .signature { margin-top: 64px; }
    </style>
</head>
<body>
    {{--
        Fields default to "—" instead of erroring: this template also renders
        older/thinner snapshots reconstructed from disk (design D7) — a
        frozen snapshot's shape must never break because the builder grew
        new fields after it was written.
    --}}
    <h1>Zaświadczenie o odbyciu stażu</h1>
    <p class="meta">Numer {{ $number ?? '—' }} &middot; {{ $edition_name ?? '—' }} &middot; wygenerowano {{ $generated_at ?? '—' }}</p>

    <table>
        <tr><td class="label">Wolontariuszka / wolontariusz</td><td>{{ $first_name ?? '—' }} {{ $last_name ?? '' }}</td></tr>
        <tr><td class="label">PESEL</td><td>{{ $pesel ?? '—' }}</td></tr>
        <tr><td class="label">Adres</td><td>{{ $address_street ?? '—' }}, {{ $address_zip ?? '' }} {{ $address_city ?? '' }}</td></tr>
        <tr><td class="label">Godziny stażu zaakceptowane</td><td>{{ $hours_accepted ?? '—' }} h</td></tr>
        <tr><td class="label">Liczba konsultacji</td><td>{{ $consultations_count ?? '—' }}</td></tr>
        <tr><td class="label">Okres programu</td><td>{{ $edition_starts_at ?? '—' }} — {{ $edition_ends_at ?? '—' }}</td></tr>
    </table>

    <p>
        Zaświadcza się, że wyżej wymieniona osoba odbyła staż w ramach programu
        wolontariackiego Fundacji Niepodzielni, edycja „{{ $edition_name ?? '—' }}”, w wymiarze
        wskazanym powyżej.
    </p>

    <div class="signature">
        <p>_______________________</p>
        <p>Opiekunka / opiekun programu</p>
    </div>
</body>
</html>
