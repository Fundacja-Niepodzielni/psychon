<?php

namespace App\Http\Controllers\Api\V1\Chat;

use App\Http\Controllers\Controller;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Skład wątku grupowego nie ma tras.
 *
 * Wątek grupowy nie ma osobnej tabeli członkostwa — `MessageThread` i
 * `ChatThreadQuery` czytają skład NA ŻYWO z `SupervisorAssignment`
 * (`unassigned_at IS NULL`). Przypisanie osoby do prowadzącego nadaje i
 * kończy wyłącznie administracja (`PUT /admin/users/{id}/supervisor`), więc
 * `routes/api/chat.php` nie rejestruje pod `/threads/{thread}/members/{user}`
 * żadnej metody. Gdyby ktoś podpiął tu trasę, obie akcje i tak odpowiadają
 * tym samym 404 co nieznany adres, zanim cokolwiek odczytają.
 */
class ThreadMemberController extends Controller
{
    public function store(): never
    {
        throw new NotFoundHttpException;
    }

    public function destroy(): never
    {
        throw new NotFoundHttpException;
    }
}
