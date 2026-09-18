<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Mailer
    |--------------------------------------------------------------------------
    |
    | This option controls the default mailer that is used to send all email
    | messages unless another mailer is explicitly specified when sending
    | the message. All additional mailers can be configured within the
    | "mailers" array. Examples of each type of mailer are provided.
    |
    */

    'default' => env('MAIL_MAILER', 'log'),

    /*
    |--------------------------------------------------------------------------
    | Mailer Configurations
    |--------------------------------------------------------------------------
    |
    | Here you may configure all of the mailers used by your application plus
    | their respective settings. Several examples have been configured for
    | you and you are free to add your own as your application requires.
    |
    | Laravel supports a variety of mail "transport" drivers that can be used
    | when delivering an email. You may specify which one you're using for
    | your mailers below. You may also add additional mailers if needed.
    |
    | Supported: "smtp", "sendmail", "mailgun", "ses", "ses-v2",
    |            "postmark", "resend", "log", "array",
    |            "failover", "roundrobin"
    |
    */

    'mailers' => [

        'smtp' => [
            'transport' => 'smtp',
            'scheme' => env('MAIL_SCHEME'),
            'url' => env('MAIL_URL'),
            'host' => env('MAIL_HOST', '127.0.0.1'),
            'port' => env('MAIL_PORT', 2525),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            'timeout' => null,
            'local_domain' => env('MAIL_EHLO_DOMAIN', parse_url((string) env('APP_URL', 'http://localhost'), PHP_URL_HOST)),
        ],

        'ses' => [
            'transport' => 'ses',
        ],

        'postmark' => [
            'transport' => 'postmark',
            // 'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID'),
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'resend' => [
            'transport' => 'resend',
        ],

        'sendmail' => [
            'transport' => 'sendmail',
            'path' => env('MAIL_SENDMAIL_PATH', '/usr/sbin/sendmail -bs -i'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL'),
        ],

        'array' => [
            'transport' => 'array',
        ],

        'failover' => [
            'transport' => 'failover',
            'mailers' => [
                'smtp',
                'log',
            ],
            'retry_after' => 60,
        ],

        'roundrobin' => [
            'transport' => 'roundrobin',
            'mailers' => [
                'ses',
                'postmark',
            ],
            'retry_after' => 60,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Global "From" Address
    |--------------------------------------------------------------------------
    |
    | You may wish for all emails sent by your application to be sent from
    | the same address. Here you may specify a name and address that is
    | used globally for all emails that are sent by your application.
    |
    */

    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', ''),
        'name' => env('MAIL_FROM_NAME', env('APP_NAME', 'Laravel')),
    ],

    // Prawda o TYM, czy wdrożenie naprawdę skonfigurowało nadawcę — liczona
    // tu, w chwili wczytania/zbudowania cache konfiguracji, a nie wywołaniem
    // env() w kodzie aplikacji (które po `config:cache` zawsze zwraca null,
    // niezależnie od realnego ustawienia). `from.address` powyżej ma teraz
    // pustą wartość domyślną celowo: żaden zmyślony adres nie ma prawa
    // wyglądać jak stan faktyczny na ekranie administracji.
    //
    // Pusty łańcuch to jednak za mało samo w sobie: zmienna może być
    // ustawiona na adres z domeny zastrzeżonej dla przykładów/testów/
    // dokumentacji (RFC 2606) albo na nazwę maszyny lokalnej — to też nie
    // jest prawdziwa konfiguracja, tylko wypełniacz, który wygląda jak
    // jedna. Adres na takiej domenie liczy się więc jak brak, nawet gdy
    // zmienna ma jakąś wartość.
    //
    // Celowo OBOK `from`, nie w jego środku: `from` jako całość czyta
    // `Illuminate\Mail\MailManager::setGlobalAddress()` i przekazuje dalej
    // do transportu — dodatkowy klucz w tamtym zbiorze jest zbędnym
    // ryzykiem, którego nie trzeba brać.
    'from_configured' => (function (): bool {
        $address = trim((string) env('MAIL_FROM_ADDRESS', ''));
        if ($address === '' || ! str_contains($address, '@')) {
            return false;
        }

        $domain = strtolower(substr($address, strrpos($address, '@') + 1));

        // Domeny zastrzeżone przez RFC 2606 na przykłady/testy/dokumentację,
        // plus nazwa maszyny lokalnej — adres na jednej z nich (albo na
        // jakiejkolwiek jej subdomenie) to wypełniacz, nie prawdziwa
        // konfiguracja.
        $zastrzezoneKoncowki = [
            'example.com', 'example.net', 'example.org', 'example.edu',
            'localhost', 'localdomain',
            '.example', '.test', '.invalid', '.localhost',
            '.local', '.internal', '.lan', '.home.arpa',
        ];
        foreach ($zastrzezoneKoncowki as $koncowka) {
            if ($domain === $koncowka || str_ends_with($domain, '.'.ltrim($koncowka, '.'))) {
                return false;
            }
        }

        return true;
    })(),

];
