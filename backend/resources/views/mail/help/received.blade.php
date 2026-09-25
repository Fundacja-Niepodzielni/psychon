<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="utf-8">
</head>
<body>
    <p>Nowe zgloszenie z okna pomocy.</p>
    <table>
        <tr>
            <th style="text-align: left;">Numer zgloszenia</th>
            <td>{{ $helpMessage->reference }}</td>
        </tr>
        <tr>
            <th style="text-align: left;">Rola nadawcy</th>
            <td>{{ $helpMessage->role }}</td>
        </tr>
        <tr>
            <th style="text-align: left;">Ekran</th>
            <td>{{ $helpMessage->screen }}</td>
        </tr>
    </table>
    <p>Tresc zgloszenia:</p>
    <p>{{ $helpMessage->content }}</p>
</body>
</html>
