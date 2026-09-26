<?php

namespace Tests\Unit\Auth;

use PHPUnit\Framework\TestCase;

/**
 * `config/keycloak.php` — odbiorca tokenu jest wartością zamrożoną
 * (`psychon-api`), a adres systemu kont przychodzi z konfiguracji.
 *
 * Czysty PHPUnit bez aplikacji Laravela: plik konfiguracji czytany wprost,
 * więc próba nie potrzebuje bazy ani kontenera.
 */
class KeycloakAudienceFrozenTest extends TestCase
{
    private const VARIABLES = ['KEYCLOAK_ISSUER', 'KEYCLOAK_AUDIENCE'];

    /** @var array<string, array{0: string|false, 1: mixed, 2: mixed}> */
    private array $saved = [];

    protected function setUp(): void
    {
        parent::setUp();

        foreach (self::VARIABLES as $name) {
            $this->saved[$name] = [getenv($name), $_ENV[$name] ?? null, $_SERVER[$name] ?? null];
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->saved as $name => [$env, $envArray, $server]) {
            $env === false ? putenv($name) : putenv("{$name}={$env}");
            $this->restore($_ENV, $name, $envArray);
            $this->restore($_SERVER, $name, $server);
        }

        parent::tearDown();
    }

    public function test_issuer_follows_the_configuration_value(): void
    {
        $this->setVariable('KEYCLOAK_ISSUER', 'https://konta.example.test/realms/pierwszy');
        $this->assertSame('https://konta.example.test/realms/pierwszy', $this->config()['issuer']);

        $this->setVariable('KEYCLOAK_ISSUER', 'https://konta.example.test/realms/drugi');
        $this->assertSame('https://konta.example.test/realms/drugi', $this->config()['issuer']);
    }

    public function test_audience_ignores_any_environment_value(): void
    {
        $this->setVariable('KEYCLOAK_ISSUER', 'https://konta.example.test/realms/pierwszy');
        $this->setVariable('KEYCLOAK_AUDIENCE', 'obcy-odbiorca');

        $config = $this->config();

        // Ten sam odczyt co wyżej widzi zmienną środowiska — więc brak reakcji
        // odbiorcy nie wynika z tego, że próba nie umie ustawić środowiska.
        $this->assertSame('https://konta.example.test/realms/pierwszy', $config['issuer']);
        $this->assertSame('psychon-api', $config['audience']);
    }

    /**
     * @return array<string, mixed>
     */
    private function config(): array
    {
        return require dirname(__DIR__, 3).'/config/keycloak.php';
    }

    private function setVariable(string $name, string $value): void
    {
        putenv("{$name}={$value}");
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }

    /**
     * @param  array<string, mixed>  $target
     */
    private function restore(array &$target, string $name, mixed $value): void
    {
        if ($value === null) {
            unset($target[$name]);
        } else {
            $target[$name] = $value;
        }
    }
}
