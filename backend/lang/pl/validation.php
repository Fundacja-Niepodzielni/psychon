<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Komunikaty walidacji
    |--------------------------------------------------------------------------
    |
    | Poniższe linie zawierają domyślne komunikaty błędów używane przez
    | walidator. Część reguł ma kilka wariantów (np. reguły rozmiaru) w
    | zależności od typu sprawdzanej wartości.
    |
    */

    'accepted' => 'Pole :attribute musi zostać zaakceptowane.',
    'accepted_if' => 'Pole :attribute musi zostać zaakceptowane, gdy :other ma wartość :value.',
    'active_url' => 'Pole :attribute musi być prawidłowym adresem URL.',
    'after' => 'Pole :attribute musi zawierać datę późniejszą niż :date.',
    'after_or_equal' => 'Pole :attribute musi zawierać datę późniejszą lub równą :date.',
    'alpha' => 'Pole :attribute może zawierać wyłącznie litery.',
    'alpha_dash' => 'Pole :attribute może zawierać wyłącznie litery, cyfry, myślniki i podkreślenia.',
    'alpha_num' => 'Pole :attribute może zawierać wyłącznie litery i cyfry.',
    'any_of' => 'Pole :attribute jest nieprawidłowe.',
    'array' => 'Pole :attribute musi być tablicą.',
    'array_keys' => 'Pole :attribute musi zawierać wyłącznie następujące klucze: :values.',
    'ascii' => 'Pole :attribute może zawierać wyłącznie jednobajtowe znaki alfanumeryczne i symbole.',
    'base64' => 'Pole :attribute musi być prawidłowym ciągiem Base64.',
    'before' => 'Pole :attribute musi zawierać datę wcześniejszą niż :date.',
    'before_or_equal' => 'Pole :attribute musi zawierać datę wcześniejszą lub równą :date.',
    'between' => [
        'array' => 'Pole :attribute musi zawierać od :min do :max elementów.',
        'file' => 'Plik w polu :attribute musi mieć od :min do :max kilobajtów.',
        'numeric' => 'Pole :attribute musi mieścić się między :min a :max.',
        'string' => 'Pole :attribute musi mieć od :min do :max znaków.',
    ],
    'boolean' => 'Pole :attribute musi przyjmować wartość prawda lub fałsz.',
    'can' => 'Pole :attribute zawiera niedozwoloną wartość.',
    'confirmed' => 'Potwierdzenie pola :attribute nie zgadza się.',
    'contains' => 'Polu :attribute brakuje wymaganej wartości.',
    'current_password' => 'Podane hasło jest nieprawidłowe.',
    'date' => 'Pole :attribute musi zawierać prawidłową datę.',
    'date_equals' => 'Pole :attribute musi zawierać datę równą :date.',
    'date_format' => 'Pole :attribute musi być zgodne z formatem :format.',
    'decimal' => 'Pole :attribute musi mieć :decimal miejsc po przecinku.',
    'declined' => 'Pole :attribute musi zostać odrzucone.',
    'declined_if' => 'Pole :attribute musi zostać odrzucone, gdy :other ma wartość :value.',
    'different' => 'Pola :attribute i :other muszą się różnić.',
    'digits' => 'Pole :attribute musi mieć :digits cyfr.',
    'digits_between' => 'Pole :attribute musi mieć od :min do :max cyfr.',
    'dimensions' => 'Pole :attribute ma nieprawidłowe wymiary obrazu.',
    'distinct' => 'Pole :attribute ma zduplikowaną wartość.',
    'doesnt_contain' => 'Pole :attribute nie może zawierać żadnej z następujących wartości: :values.',
    'doesnt_end_with' => 'Pole :attribute nie może kończyć się żadną z następujących wartości: :values.',
    'doesnt_start_with' => 'Pole :attribute nie może zaczynać się żadną z następujących wartości: :values.',
    'email' => 'Pole :attribute musi zawierać prawidłowy adres e-mail.',
    'encoding' => 'Pole :attribute musi być zakodowane w :encoding.',
    'ends_with' => 'Pole :attribute musi kończyć się jedną z następujących wartości: :values.',
    'enum' => 'Wybrana wartość pola :attribute jest nieprawidłowa.',
    'exists' => 'Wybrana wartość pola :attribute jest nieprawidłowa.',
    'extensions' => 'Pole :attribute musi mieć jedno z następujących rozszerzeń: :values.',
    'file' => 'Pole :attribute musi być plikiem.',
    'filled' => 'Pole :attribute musi mieć wartość.',
    'gt' => [
        'array' => 'Pole :attribute musi zawierać więcej niż :value elementów.',
        'file' => 'Plik w polu :attribute musi być większy niż :value kilobajtów.',
        'numeric' => 'Pole :attribute musi być większe niż :value.',
        'string' => 'Pole :attribute musi być dłuższe niż :value znaków.',
    ],
    'gte' => [
        'array' => 'Pole :attribute musi zawierać :value elementów lub więcej.',
        'file' => 'Plik w polu :attribute musi być większy lub równy :value kilobajtów.',
        'numeric' => 'Pole :attribute musi być większe lub równe :value.',
        'string' => 'Pole :attribute musi mieć co najmniej :value znaków.',
    ],
    'hex_color' => 'Pole :attribute musi być prawidłowym kolorem szesnastkowym.',
    'image' => 'Pole :attribute musi być obrazem.',
    'in' => 'Wybrana wartość pola :attribute jest nieprawidłowa.',
    'in_array' => 'Pole :attribute musi występować w :other.',
    'in_array_keys' => 'Pole :attribute musi zawierać co najmniej jeden z następujących kluczy: :values.',
    'integer' => 'Pole :attribute musi być liczbą całkowitą.',
    'ip' => 'Pole :attribute musi być prawidłowym adresem IP.',
    'ipv4' => 'Pole :attribute musi być prawidłowym adresem IPv4.',
    'ipv6' => 'Pole :attribute musi być prawidłowym adresem IPv6.',
    'json' => 'Pole :attribute musi być prawidłowym ciągiem JSON.',
    'list' => 'Pole :attribute musi być listą.',
    'lowercase' => 'Pole :attribute musi być zapisane małymi literami.',
    'lt' => [
        'array' => 'Pole :attribute musi zawierać mniej niż :value elementów.',
        'file' => 'Plik w polu :attribute musi być mniejszy niż :value kilobajtów.',
        'numeric' => 'Pole :attribute musi być mniejsze niż :value.',
        'string' => 'Pole :attribute musi być krótsze niż :value znaków.',
    ],
    'lte' => [
        'array' => 'Pole :attribute nie może zawierać więcej niż :value elementów.',
        'file' => 'Plik w polu :attribute musi być mniejszy lub równy :value kilobajtów.',
        'numeric' => 'Pole :attribute musi być mniejsze lub równe :value.',
        'string' => 'Pole :attribute nie może być dłuższe niż :value znaków.',
    ],
    'mac_address' => 'Pole :attribute musi być prawidłowym adresem MAC.',
    'max' => [
        'array' => 'Pole :attribute nie może zawierać więcej niż :max elementów.',
        'file' => 'Plik w polu :attribute nie może być większy niż :max kilobajtów.',
        'numeric' => 'Pole :attribute nie może być większe niż :max.',
        'string' => 'Pole :attribute nie może być dłuższe niż :max znaków.',
    ],
    'max_digits' => 'Pole :attribute nie może mieć więcej niż :max cyfr.',
    'mimes' => 'Pole :attribute musi być plikiem typu: :values.',
    'mimetypes' => 'Pole :attribute musi być plikiem typu: :values.',
    'min' => [
        'array' => 'Pole :attribute musi zawierać co najmniej :min elementów.',
        'file' => 'Plik w polu :attribute musi mieć co najmniej :min kilobajtów.',
        'numeric' => 'Pole :attribute musi wynosić co najmniej :min.',
        'string' => 'Pole :attribute musi mieć co najmniej :min znaków.',
    ],
    'min_digits' => 'Pole :attribute musi mieć co najmniej :min cyfr.',
    'missing' => 'Pole :attribute musi być nieobecne.',
    'missing_if' => 'Pole :attribute musi być nieobecne, gdy :other ma wartość :value.',
    'missing_unless' => 'Pole :attribute musi być nieobecne, chyba że :other ma wartość :value.',
    'missing_with' => 'Pole :attribute musi być nieobecne, gdy występuje :values.',
    'missing_with_all' => 'Pole :attribute musi być nieobecne, gdy występują :values.',
    'multiple_of' => 'Pole :attribute musi być wielokrotnością :value.',
    'not_in' => 'Wybrana wartość pola :attribute jest nieprawidłowa.',
    'not_regex' => 'Format pola :attribute jest nieprawidłowy.',
    'numeric' => 'Pole :attribute musi być liczbą.',
    'password' => [
        'letters' => 'Pole :attribute musi zawierać co najmniej jedną literę.',
        'mixed' => 'Pole :attribute musi zawierać co najmniej jedną wielką i jedną małą literę.',
        'numbers' => 'Pole :attribute musi zawierać co najmniej jedną cyfrę.',
        'symbols' => 'Pole :attribute musi zawierać co najmniej jeden symbol.',
        'uncompromised' => 'Podana wartość pola :attribute pojawiła się w wycieku danych. Wybierz inną wartość pola :attribute.',
    ],
    'present' => 'Pole :attribute musi być obecne.',
    'present_if' => 'Pole :attribute musi być obecne, gdy :other ma wartość :value.',
    'present_unless' => 'Pole :attribute musi być obecne, chyba że :other ma wartość :value.',
    'present_with' => 'Pole :attribute musi być obecne, gdy występuje :values.',
    'present_with_all' => 'Pole :attribute musi być obecne, gdy występują :values.',
    'prohibited' => 'Pole :attribute jest niedozwolone.',
    'prohibited_if' => 'Pole :attribute jest niedozwolone, gdy :other ma wartość :value.',
    'prohibited_if_accepted' => 'Pole :attribute jest niedozwolone, gdy :other zostało zaakceptowane.',
    'prohibited_if_declined' => 'Pole :attribute jest niedozwolone, gdy :other zostało odrzucone.',
    'prohibited_unless' => 'Pole :attribute jest niedozwolone, chyba że :other znajduje się w :values.',
    'prohibits' => 'Pole :attribute uniemożliwia obecność pola :other.',
    'regex' => 'Format pola :attribute jest nieprawidłowy.',
    'required' => 'Pole :attribute jest wymagane.',
    'required_array_keys' => 'Pole :attribute musi zawierać wpisy dla: :values.',
    'required_if' => 'Pole :attribute jest wymagane, gdy :other ma wartość :value.',
    'required_if_accepted' => 'Pole :attribute jest wymagane, gdy :other zostało zaakceptowane.',
    'required_if_declined' => 'Pole :attribute jest wymagane, gdy :other zostało odrzucone.',
    'required_unless' => 'Pole :attribute jest wymagane, chyba że :other znajduje się w :values.',
    'required_with' => 'Pole :attribute jest wymagane, gdy występuje :values.',
    'required_with_all' => 'Pole :attribute jest wymagane, gdy występują :values.',
    'required_without' => 'Pole :attribute jest wymagane, gdy nie występuje :values.',
    'required_without_all' => 'Pole :attribute jest wymagane, gdy nie występuje żadne z: :values.',
    'same' => 'Pole :attribute musi być zgodne z polem :other.',
    'size' => [
        'array' => 'Pole :attribute musi zawierać :size elementów.',
        'file' => 'Plik w polu :attribute musi mieć :size kilobajtów.',
        'numeric' => 'Pole :attribute musi wynosić :size.',
        'string' => 'Pole :attribute musi mieć :size znaków.',
    ],
    'starts_with' => 'Pole :attribute musi zaczynać się od jednej z następujących wartości: :values.',
    'string' => 'Pole :attribute musi być ciągiem znaków.',
    'timezone' => 'Pole :attribute musi być prawidłową strefą czasową.',
    'unique' => 'Podana wartość pola :attribute jest już zajęta.',
    'uploaded' => 'Przesyłanie pliku w polu :attribute nie powiodło się.',
    'uppercase' => 'Pole :attribute musi być zapisane wielkimi literami.',
    'url' => 'Pole :attribute musi być prawidłowym adresem URL.',
    'ulid' => 'Pole :attribute musi być prawidłowym identyfikatorem ULID.',
    'uuid' => 'Pole :attribute musi być prawidłowym identyfikatorem UUID.',

    /*
    |--------------------------------------------------------------------------
    | Własne komunikaty walidacji
    |--------------------------------------------------------------------------
    |
    | Tu można podać własne komunikaty dla konkretnych pól i reguł, w
    | konwencji "pole.regula".
    |
    */

    'custom' => [],

    /*
    |--------------------------------------------------------------------------
    | Własne nazwy pól
    |--------------------------------------------------------------------------
    |
    | Polskie nazwy pól dla zdań w rodzaju "Pole ... musi ...": każda nazwa
    | jest w mianowniku, tak żeby pasowała do tego wzorca zdania niezależnie
    | od konkretnej reguły. Lista obejmuje pola z reguł FormRequest, które nie
    | mają własnego komunikatu (znalezione skanem reflekcją).
    |
    */

    'attributes' => [
        'address.city' => 'miasto',
        'address.street' => 'ulica',
        'address.zip' => 'kod pocztowy',
        'answer' => 'odpowiedź',
        'answers.*.body' => 'treść odpowiedzi',
        'attendance.*' => 'status obecności',
        'bio' => 'biogram',
        'body' => 'treść',
        'city' => 'miasto',
        'description' => 'opis',
        'expectations' => 'oczekiwania',
        'experience' => 'doświadczenie',
        'first_name' => 'imię',
        'form' => 'forma dyżuru',
        'last_name' => 'nazwisko',
        'months' => 'liczba miesięcy',
        'name' => 'nazwa',
        'pesel' => 'numer PESEL',
        'phone' => 'numer telefonu',
        'product_group' => 'grupa produktowa',
        'program' => 'program',
        'question' => 'pytanie',
        'reason' => 'powód',
        'role' => 'rola',
        'sequence_order' => 'kolejność',
        'slug' => 'uproszczony adres',
        'title' => 'tytuł',
        'type' => 'typ',
        'until' => 'data wygaśnięcia dostępu',
        'video' => 'wideo',
        'video_provider_id' => 'identyfikator nagrania',
    ],

];
