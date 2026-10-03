{{--
    The one layout of every e-mail: header, greeting, content (paragraphs,
    details, „Co dalej” box), at most one button row, footer. Rendered once
    as an HTML document with inline styles and once as plain text.
--}}
@props(['subject', 'reason'])
@php($style = \App\Support\Emails\EmailStyle::class)
@php($email = \App\Support\Emails\EmailContext::current())
@php($email->subject = $subject)
@php($bg = $style::COLOR['bg'])
@if ($email->isText())
<x-email.header />
<x-email.greeting />
{{ $slot }}
<x-email.footer :reason="$reason" />
@else
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{{ $subject }}</title>
</head>
<body style="margin:0;padding:0;width:100%;background:{{ $bg }};">
<div lang="pl" style="margin:0;padding:0;background:{{ $bg }};"><div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:{{ $bg }};">{{ $email->preheader }}{!! str_repeat('&#847;&zwnj;&nbsp;', 40) !!}</div><table {!! $style::TABLE !!} style="background:{{ $bg }};"><tr><td align="center" bgcolor="{{ $bg }}" style="padding:24px 12px;"><!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><table {!! $style::TABLE !!} style="max-width:600px;width:100%;background:{{ $style::COLOR['card'] }};border:1px solid {{ $style::COLOR['border'] }};border-radius:16px;border-collapse:separate;">
<x-email.header />
<x-email.greeting />
{{ $slot }}
<x-email.footer :reason="$reason" />
</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></div>
</body>
</html>
@endif
