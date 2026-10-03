{{-- Molecule „akapit”: one paragraph of running text. --}}
@php($style = \App\Support\Emails\EmailStyle::class)
@php($email = \App\Support\Emails\EmailContext::current())
@if ($email->isText()){{ $email->textBlock('paragraph', $email::plain($email::flow($slot))) }}@else{!! $style::rowStart(16) !!}<p style="{!! $style::text('body') !!}">{!! $email::flow($slot) !!}</p>{!! $style::ROW_END !!}@endif
