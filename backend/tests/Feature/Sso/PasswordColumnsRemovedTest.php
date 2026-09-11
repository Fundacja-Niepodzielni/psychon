<?php

namespace Tests\Feature\Sso;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * "Zero password columns at the end" (sprint-2 §1 criterion; stage E2
 * dropped the columns in `2026_09_11_130000_drop_password_auth_from_users_table.php`).
 * `RefreshDatabase` runs every migration against a fresh schema for this
 * test the same way it does for every other one — this asserts what that
 * migration set leaves behind, not what any single migration file says it
 * does in isolation.
 */
class PasswordColumnsRemovedTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_table_has_no_password_or_remember_token_column(): void
    {
        $this->assertFalse(Schema::hasColumn('users', 'password'), 'users.password must not exist — PsychON is SSO-only.');
        $this->assertFalse(Schema::hasColumn('users', 'remember_token'), 'users.remember_token must not exist — PsychON is SSO-only.');
    }

    public function test_users_table_keeps_the_invitation_binding_token_column(): void
    {
        // `activation_token` is NOT a password-reset artefact — it is the
        // one-time invitation token `POST /api/v1/sso/powiaz` consumes
        // (R1). Dropping it would break binding, not authentication by
        // password.
        $this->assertTrue(Schema::hasColumn('users', 'activation_token'));
    }

    public function test_password_reset_tokens_table_does_not_exist(): void
    {
        $this->assertFalse(Schema::hasTable('password_reset_tokens'));
    }

    public function test_personal_access_tokens_table_does_not_exist(): void
    {
        $this->assertFalse(Schema::hasTable('personal_access_tokens'), 'Sanctum is fully removed — no personal_access_tokens table.');
    }
}
