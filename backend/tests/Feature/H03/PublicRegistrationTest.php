<?php

namespace Tests\Feature\H03;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PublicRegistrationTest extends TestCase
{
    public function test_api_has_no_self_registration_route(): void
    {
        $registrationRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RoutingRoute $route): bool => str_contains($route->uri(), 'register'));

        $this->assertCount(0, $registrationRoutes);
    }

    public function test_common_public_registration_paths_are_not_found(): void
    {
        $this->postJson('/api/v1/register')->assertNotFound();
        $this->postJson('/api/v1/auth/register')->assertNotFound();
    }
}
