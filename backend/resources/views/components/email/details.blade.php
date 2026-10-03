{{--
    Molecule „lista szczegółów”: label and value, one under the other.
    `rows`: list of [label, value] or [label, e-mail address, 'mailto'].
    A value with line breaks stands under its label in the text version.
--}}
@props(['rows'])
@php($style = \App\Support\Emails\EmailStyle::class)
@php($email = \App\Support\Emails\EmailContext::current())
@php($rows = array_map(fn (array $row): array => [$row[0], str_replace(["\r\n", "\r"], "\n", (string) $row[1]), $row[2] ?? null], $rows))
@if ($email->isText()){{ $email->textBlock('details', implode("\n", array_map(fn (array $row): string => $row[0].(str_contains($row[1], "\n") ? ":\n" : ': ').$row[1], $rows))) }}@else{!! $style::rowStart(16) !!}<table {!! $style::TABLE !!} style="border:1px solid {{ $style::COLOR['border'] }};border-radius:12px;border-collapse:separate;">@foreach ($rows as $i => [$label, $value, $kind])<tr><td style="padding:12px 16px;{{ $i === 0 ? '' : 'border-top:1px solid '.$style::COLOR['border'].';' }}"><p style="{!! $style::text('small', $style::COLOR['muted']) !!}">{{ $label }}</p><p style="{!! $style::text('body', $style::COLOR['ink'], 'overflow-wrap:anywhere;word-break:break-word;') !!}">@if ($kind === 'mailto')<x-email.link :href="'mailto:'.$value">{{ $value }}</x-email.link>@else{!! str_replace("\n", '<br>', e($value)) !!}@endif</p></td></tr>@endforeach</table>{!! $style::ROW_END !!}@endif
