<?php

namespace App\Support;

use App\Models\Setting;

/**
 * Pakiet H16 · Ustawienia powiadomień administracji.
 *
 * Trzymane jako jeden wiersz w tabeli `settings` (klucz `notification_settings`,
 * `value` = JSON), wzorzec jak `OnboardingContent`. Brak wiersza = obecne
 * zachowanie sprzed tej zmiany: wszystkie typy włączone, blok przypomnienia
 * o superwizji włączony, `08:00`.
 *
 * `TYPES` to dokładnie lista z kontraktu §3.1 bez `supervision.reminder` —
 * ten typ ma własny, osobny blok (`supervision_reminder`), bo niesie też
 * godzinę wysyłki, nie tylko flagę włącz/wyłącz.
 *
 * `email_contact` to „Kontakt w e-mailach”: tekst linii „Kontakt z Fundacją”
 * w stopce e-maili (`EmailContact`). Pusty — linii nie ma.
 */
final class NotificationSettings
{
    public const string KEY = 'notification_settings';

    public const array TYPES = [
        'application.accepted',
        'application.rejected',
        'assignment.created',
        'assignment.removed',
        'course.invited',
        'course.unlocked',
        'question.asked',
        'question.answered',
        'internship.accepted',
        'internship.returned',
        'internship.rejected',
        'attempt.failed_final',
        'certificate.ready',
        'document.ready',
        'profile.accepted',
        'profile.returned',
        'profile.withdrawn',
        'export.ready',
        'cooperation_request.answered',
        'supervision.slot_cancelled',
    ];

    public const int EMAIL_CONTACT_MAX = 300;

    public const string DEFAULT_SEND_AT = '08:00';

    /**
     * Pełny stan: wszystkie typy scalone z zapisem administracji.
     *
     * @return array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}
     */
    public static function get(): array
    {
        $stored = Setting::query()->where('key', self::KEY)->value('value');
        $decoded = is_string($stored) ? json_decode($stored, true) : null;
        $decoded = is_array($decoded) ? $decoded : [];

        // Zapis w bazie jest już w kształcie WEWNĘTRZNYM (mapa typ => bool),
        // dokładnie takim jak `defaults()` — nigdy w kształcie żądania PATCH
        // (lista `{type, enabled}`). Stąd osobny scalacz `mergeStored`, różny
        // od `applyPatch` niżej: pomylenie obu kształtów sprawiało, że każdy
        // odczyt po pierwszym zapisie wracał do wartości domyślnych.
        return self::mergeStored(self::defaults(), $decoded);
    }

    /**
     * Zapisuje częściową aktualizację (kształt zwalidowany przez FormRequest —
     * `types` jako lista `{type, enabled}`), scaloną z bieżącym stanem, i
     * zwraca pełny stan po zapisie.
     *
     * @param  array<string, mixed>  $patch
     * @return array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}
     */
    public static function put(array $patch): array
    {
        $merged = self::applyPatch(self::get(), $patch);

        Setting::query()->updateOrCreate(
            ['key' => self::KEY],
            ['value' => json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
        );

        return $merged;
    }

    /**
     * Czy dany typ (z listy `TYPES`) jest włączony. Typ spoza listy (nieobjęty
     * tym panelem) jest zawsze traktowany jako włączony — panel nim nie steruje.
     */
    public static function isTypeEnabled(string $type): bool
    {
        if (! in_array($type, self::TYPES, true)) {
            return true;
        }

        return (bool) (self::get()['types'][$type] ?? true);
    }

    /**
     * Blok przypomnienia o superwizji: flaga włączenia i godzina wysyłki `HH:00`.
     *
     * @return array{enabled: bool, send_at: string}
     */
    public static function supervisionReminder(): array
    {
        return self::get()['supervision_reminder'];
    }

    /**
     * „Kontakt w e-mailach” — null, gdy administracja go nie podała.
     */
    public static function emailContact(): ?string
    {
        return self::get()['email_contact'];
    }

    /**
     * @return array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}
     */
    private static function defaults(): array
    {
        return [
            'types' => array_fill_keys(self::TYPES, true),
            'supervision_reminder' => ['enabled' => true, 'send_at' => self::DEFAULT_SEND_AT],
            'email_contact' => null,
        ];
    }

    /**
     * Scala stan bazowy z odczytem z bazy — `$decoded['types']` jest mapą
     * `typ => bool` (kształt wewnętrzny, ten sam co `defaults()`).
     *
     * @param  array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}  $base
     * @param  array<string, mixed>  $decoded
     * @return array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}
     */
    private static function mergeStored(array $base, array $decoded): array
    {
        if (isset($decoded['types']) && is_array($decoded['types'])) {
            foreach ($decoded['types'] as $type => $enabled) {
                if (! is_string($type) || ! array_key_exists($type, $base['types'])) {
                    continue;
                }

                $base['types'][$type] = (bool) $enabled;
            }
        }

        if (isset($decoded['supervision_reminder']) && is_array($decoded['supervision_reminder'])) {
            if (array_key_exists('enabled', $decoded['supervision_reminder'])) {
                $base['supervision_reminder']['enabled'] = (bool) $decoded['supervision_reminder']['enabled'];
            }

            if (array_key_exists('send_at', $decoded['supervision_reminder'])) {
                $base['supervision_reminder']['send_at'] = (string) $decoded['supervision_reminder']['send_at'];
            }
        }

        if (array_key_exists('email_contact', $decoded)) {
            $base['email_contact'] = self::normalizedContact($decoded['email_contact']);
        }

        return $base;
    }

    /**
     * Nakłada kształt żądania PATCH (zwalidowany FormRequestem) na stan
     * bazowy — `$patch['types']` jest LISTĄ `{type, enabled}` (kształt
     * zewnętrzny/kontraktowy), inny niż kształt wewnętrzny z `mergeStored`.
     *
     * @param  array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}  $base
     * @param  array<string, mixed>  $patch
     * @return array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}
     */
    private static function applyPatch(array $base, array $patch): array
    {
        if (isset($patch['types']) && is_array($patch['types'])) {
            foreach ($patch['types'] as $entry) {
                if (! is_array($entry) || ! isset($entry['type'], $entry['enabled'])) {
                    continue;
                }

                if (! array_key_exists($entry['type'], $base['types'])) {
                    continue;
                }

                $base['types'][$entry['type']] = (bool) $entry['enabled'];
            }
        }

        if (isset($patch['supervision_reminder']) && is_array($patch['supervision_reminder'])) {
            if (array_key_exists('enabled', $patch['supervision_reminder'])) {
                $base['supervision_reminder']['enabled'] = (bool) $patch['supervision_reminder']['enabled'];
            }

            if (array_key_exists('send_at', $patch['supervision_reminder'])) {
                $base['supervision_reminder']['send_at'] = (string) $patch['supervision_reminder']['send_at'];
            }
        }

        if (array_key_exists('email_contact', $patch)) {
            $base['email_contact'] = self::normalizedContact($patch['email_contact']);
        }

        return $base;
    }

    private static function normalizedContact(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';

        return $value === '' ? null : $value;
    }
}
