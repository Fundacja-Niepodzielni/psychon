# Przegląd bezpieczeństwa ASVS L2: uwierzytelnianie, sesja, kontrola dostępu

Baza: `sprint-2` @ `3463eac`. Stan: w toku — tabela wymagań jest uzupełniana.

## Zakres

- Standard: OWASP ASVS 5.0, poziom L2 (wymagania L1 i L2).
- Rozdziały: w ASVS 5.0 uwierzytelnianie, sesja i kontrola dostępu to rozdziały
  **V6 Authentication**, **V7 Session Management** i **V8 Authorization**
  (w ASVS 4.0.3 miały numery V2, V3, V4; w 5.0 numery V2–V4 oznaczają walidację,
  front i API). Przegląd dotyczy treści, nie numerów rozdziałów: V6, V7, V8 z 5.0.
- Zaplecze: `backend/app`, `backend/routes/api/*.php`, `backend/config/keycloak.php`,
  polityki, middleware. Front: `frontend/auth.ts`, strażnicy ról ekranów.
- Lista kontrolna pomocnicza: OWASP Cheat Sheet Series — arkusze *Authentication*,
  *Session Management*, *Authorization*, *Access Control*.
