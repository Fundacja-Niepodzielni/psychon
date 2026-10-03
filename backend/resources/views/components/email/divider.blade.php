{{-- Atom „linia podziału”. --}}
@if (\App\Support\Emails\EmailContext::current()->isText())----------@else<table {!! \App\Support\Emails\EmailStyle::TABLE !!}><tr><td style="height:1px;line-height:1px;font-size:1px;background:{{ \App\Support\Emails\EmailStyle::COLOR['border'] }};">&nbsp;</td></tr></table>@endif
