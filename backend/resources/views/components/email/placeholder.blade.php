{{-- Atom „wartość do uzupełnienia”: a value the administration has yet to fill in. --}}
@php($c = \App\Support\Emails\EmailStyle::COLOR)
@if (\App\Support\Emails\EmailContext::current()->isText()){{ $slot }}@else<span style="padding:1px 6px;border:1px dashed {{ $c['warn'] }};border-radius:6px;background:{{ $c['warn_bg'] }};color:{{ $c['warn'] }};font-weight:500;">{{ $slot }}</span>@endif
