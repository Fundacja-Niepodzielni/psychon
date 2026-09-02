@php
    /** @var \App\Models\Certificate $certificate */
    /** @var \App\Models\User $user */
    /** @var \App\Models\Edition $edition */
    /** @var string $verify_url */
    /** @var string $qr_svg */
    $issued = $certificate->issued_at?->format('d.m.Y') ?? '';
@endphp
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="utf-8">
    <title>Certyfikat {{ $certificate->number }}</title>
    <style>
        /* DejaVu to jedyna rodzina wbudowana w dompdf z pełnym polskim alfabetem —
           czcionki rdzeniowe (Times, Helvetica) gubią ą, ć, ę, ł, ń, ó, ś, ź, ż. */
        body { font-family: 'DejaVu Serif', serif; color: #1f2430; margin: 0; }
        .sheet { padding: 36px 44px; border: 2px solid #2f6f4f; }
        .brand { letter-spacing: .22em; text-transform: uppercase; font-size: 11px; color: #2f6f4f; }
        h1 { font-size: 28px; margin: 20px 0 6px; }
        .lead { font-size: 13px; color: #556; margin: 0 0 24px; line-height: 1.6; }
        .name { font-size: 24px; font-weight: bold; margin: 8px 0 4px; }
        .meta { margin-top: 32px; font-size: 12px; color: #556; line-height: 1.7; }
        .verify { margin-top: 28px; padding-top: 16px; border-top: 1px solid #d7ddd7; font-size: 11px; color: #556; }
        .verify a { color: #2f6f4f; word-break: break-all; }
        .qr { width: 108px; height: 108px; margin-top: 10px; }
        .qr-caption { font-family: 'DejaVu Sans', sans-serif; font-size: 9px; color: #8a9; margin-top: 4px; }
    </style>
</head>
<body>
<div class="sheet">
    <div class="brand">Fundacja Niepodzielni · Program PsychON</div>
    <h1>Certyfikat ukończenia programu</h1>
    <p class="lead">Niniejszym zaświadcza się, że</p>

    <div class="name">{{ $user->first_name }} {{ $user->last_name }}</div>
    <p class="lead">ukończył(a) pełny program szkoleniowy edycji {{ $edition->starts_at?->year }},
        spełniając wszystkie warunki: etapy i testy wiedzy, godziny stażu,
        obecności na superwizjach oraz warsztat stacjonarny.</p>

    <div class="meta">
        <div><strong>Numer certyfikatu:</strong> {{ $certificate->number }}</div>
        <div><strong>Data wydania:</strong> {{ $issued }}</div>
        <div><strong>Edycja:</strong> {{ $edition->name }}</div>
    </div>

    <div class="verify">
        Autentyczność potwierdzisz, skanując kod albo otwierając adres:<br>
        <a href="{{ $verify_url }}">{{ $verify_url }}</a>

        {{-- QR przygotowany przez GenerateCertificate jako SVG w data: URI
             (obraz kontenera nie ma gd; dompdf pomija SVG wklejony inline). --}}
        <img class="qr" src="{{ $qr_svg }}" alt="Kod QR weryfikacji certyfikatu {{ $certificate->number }}">

        <div class="qr-caption">Kod prowadzi do publicznej weryfikacji certyfikatu.</div>
    </div>
</div>
</body>
</html>
