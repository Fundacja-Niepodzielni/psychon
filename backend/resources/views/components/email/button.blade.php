{{-- Atom „przycisk główny”: green button with a platform address. --}}
@props(['href'])
@php($c = \App\Support\Emails\EmailStyle::COLOR)
@php([$size, $lineHeight, $weight] = \App\Support\Emails\EmailStyle::TYPE['button'])
@if (\App\Support\Emails\EmailContext::current()->isText()){{ $slot }}@else<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" bgcolor="{{ $c['primary'] }}" style="border-radius:8px;background:{{ $c['primary'] }};"><a href="{{ $href }}" target="_blank" style="display:inline-block;padding:12px 24px;border:1px solid {{ $c['primary'] }};border-radius:8px;font-family:{!! \App\Support\Emails\EmailStyle::FONT !!};font-size:{{ $size }}px;line-height:{{ $lineHeight }}px;font-weight:{{ $weight }};color:{{ $c['on_primary'] }};text-decoration:none;">{{ $slot }}</a></td></tr></table>@endif
