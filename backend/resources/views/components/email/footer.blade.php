{{--
    Molecule „stopka”: why the person gets the e-mail, whether they can
    switch such e-mails off, the Foundation's contact (not in e-mails to the
    Foundation's own team) and the Foundation's name.
--}}
@props(['reason'])
@php($style = \App\Support\Emails\EmailStyle::class)
@php($email = \App\Support\Emails\EmailContext::current())
@php($contact = $email->isTeam() ? null : \App\Support\Emails\EmailContact::value())
@php($lines = array_values(array_filter([
    e('Wiadomość wysłała platforma PsychON Fundacji Niepodzielni. Dostajesz ją, bo '.$reason.'.'),
    $email->switchableByPerson() ? e('Wiadomości tego rodzaju możesz wyłączyć w panelu PsychON: Profil → Powiadomienia e-mail. Powiadomienie w panelu nadal się pojawi.') : null,
    $contact !== null && $contact !== '' ? e('Kontakt z Fundacją: ').$email->contact() : null,
])))
@if ($email->isText()){{ $email->textBlock('footer', $email::plain(implode("\n", ['----------', ...$lines, 'Fundacja Niepodzielni']))) }}@else{!! $style::rowStart(32, 24) !!}<x-email.divider />@foreach ($lines as $i => $line)<p style="{!! $style::text('small', $style::COLOR['muted'], 'padding-top:'.($i === 0 ? 16 : 8).'px;') !!}">{!! $line !!}</p>@endforeach<p style="{!! $style::text('small', $style::COLOR['ink'], 'padding-top:12px;font-weight:700;') !!}">Fundacja Niepodzielni</p>{!! $style::ROW_END !!}@endif
