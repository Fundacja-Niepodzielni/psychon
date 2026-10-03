{{-- Atom „odnośnik tekstowy”. --}}
@props(['href'])
@if (\App\Support\Emails\EmailContext::current()->isText()){{ $slot }}@else<a href="{{ $href }}" target="_blank" style="color:{{ \App\Support\Emails\EmailStyle::COLOR['link'] }};text-decoration:underline;">{{ $slot }}</a>@endif
