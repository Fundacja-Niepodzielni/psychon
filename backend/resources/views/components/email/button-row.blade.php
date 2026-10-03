{{-- Molecule „wiersz przycisku”: the one button of an e-mail and its address written out. --}}
@props(['label', 'path'])
@php($style = \App\Support\Emails\EmailStyle::class)
@php($email = \App\Support\Emails\EmailContext::current())
@php($url = \App\Support\Emails\EmailLinks::url($path))
@if ($email->isText()){{ $email->textBlock('button_row', $label.': '.$url) }}@else{!! $style::rowStart(24) !!}<x-email.button :href="$url">{{ $label }}</x-email.button><p style="{!! $style::text('small', $style::COLOR['muted'], 'padding-top:8px;word-break:break-all;') !!}">{{ $url }}</p>{!! $style::ROW_END !!}@endif
