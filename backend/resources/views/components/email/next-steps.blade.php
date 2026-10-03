{{-- Molecule „ramka »Co dalej«”: what the person should do next. --}}
@php($style = \App\Support\Emails\EmailStyle::class)
@php($email = \App\Support\Emails\EmailContext::current())
@php($tint = $style::COLOR['brand_tint'])
@if ($email->isText()){{ $email->textBlock('next_steps', 'Co dalej: '.$email::plain($email::flow($slot))) }}@else{!! $style::rowStart(16) !!}<table {!! $style::TABLE !!} style="background:{{ $tint }};border-radius:12px;border-collapse:separate;"><tr><td bgcolor="{{ $tint }}" style="padding:16px;border-radius:12px;"><p style="{!! $style::text('title', $style::COLOR['ink'], 'padding-bottom:4px;') !!}">Co dalej</p><p style="{!! $style::text('body') !!}">{!! $email::flow($slot) !!}</p></td></tr></table>{!! $style::ROW_END !!}@endif
