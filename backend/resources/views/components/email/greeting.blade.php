{{-- Molecule „powitanie”: always „Dzień dobry,”, without a name. --}}
@php($style = \App\Support\Emails\EmailStyle::class)
@if (\App\Support\Emails\EmailContext::current()->isText()){{ \App\Support\Emails\EmailContext::current()->textBlock('greeting', 'Dzień dobry,') }}@else{!! $style::rowStart(24) !!}<p style="{!! $style::text('body', $style::COLOR['ink']) !!}">Dzień dobry,</p>{!! $style::ROW_END !!}@endif
