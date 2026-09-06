@php
    /** @var \App\Models\Certificate $certificate */
    /** @var \App\Models\User $user */
    /** @var \App\Models\Edition $edition */
    $base = rtrim(config('app.frontend_url') ?? config('app.url'), '/');
    $verifyUrl = $base.'/certyfikat?token='.$certificate->verification_token;
    $issued = $certificate->issued_at?->format('d.m.Y') ?? '';
@endphp
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="utf-8">
    <title>Certyfikat {{ $certificate->number }}</title>
    <style>
        body { font-family: Georgia, 'Times New Roman', serif; color: #1f2430; margin: 0; }
        .sheet { width: 720px; margin: 40px auto; padding: 56px 64px; border: 2px solid #2f6f4f; }
        .brand { letter-spacing: .28em; text-transform: uppercase; font-size: 13px; color: #2f6f4f; }
        h1 { font-size: 34px; margin: 24px 0 8px; }
        .lead { font-size: 15px; color: #556; margin: 0 0 32px; }
        .name { font-size: 28px; font-weight: bold; margin: 8px 0 4px; }
        .meta { margin-top: 40px; font-size: 13px; color: #556; line-height: 1.7; }
        .verify { margin-top: 32px; padding-top: 20px; border-top: 1px solid #d7ddd7; font-size: 12px; color: #556; }
        .verify a { color: #2f6f4f; word-break: break-all; }
        .qr-placeholder {
            width: 120px; height: 120px; border: 1px dashed #9aa; border-radius: 6px;
            display: flex; align-items: center; justify-content: center; text-align: center;
            font-family: sans-serif; font-size: 10px; color: #9aa; margin-top: 12px;
        }
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
        Autentyczność potwierdzisz na stronie weryfikacji:<br>
        <a href="{{ $verifyUrl }}">{{ $verifyUrl }}</a>
        {{-- Realny kod QR po hackathonie razem z podmianą PdfService na właściwy renderer PDF. --}}
        <div class="qr-placeholder">kod QR<br>(po hackathonie)</div>
    </div>
</div>
</body>
</html>
