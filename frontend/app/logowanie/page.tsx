"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

type Role = "super_admin" | "project_manager" | "instructor" | "volunteer" | "student";

/** Przekierowanie po zalogowaniu wg roli (słownik ról — kontrakt §3.4). */
const HOME_BY_ROLE: Record<Role, string> = {
  volunteer: "/panel/start",
  student: "/panel/start",
  instructor: "/prowadzacy",
  project_manager: "/admin",
  super_admin: "/admin",
};

function isRole(value: string | undefined): value is Role {
  return !!value && value in HOME_BY_ROLE;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setFormError("Nieprawidłowy e-mail lub hasło.");
      setLoading(false);
      return;
    }

    const session = await getSession();
    const role = session?.user?.roles?.[0];
    router.push(isRole(role) ? HOME_BY_ROLE[role] : "/panel/start");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-12 items-center justify-center rounded-md bg-brand text-h3 font-black text-light"
          >
            N
          </span>
          <h1 className="mt-3 text-h2 font-black text-ink">Niepodzielni</h1>
          <p className="mt-1 text-small text-subtle">
            Platforma szkoleniowa — zaloguj się, aby kontynuować
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {formError && <Alert variant="error">{formError}</Alert>}

            <Input
              label="Adres e-mail"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Hasło"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" loading={loading} className="mt-2 w-full">
              Zaloguj się
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-caption text-subtle">
          Masz konto Fundacji Niepodzielni?{" "}
          <a href="/logowanie/konta" className="underline">
            Zaloguj się przez Konta Niepodzielni
          </a>
          .
        </p>
        <p className="mt-2 text-center text-caption text-subtle">
          Problem z logowaniem? Skontaktuj się z opiekunem projektu.
        </p>
      </div>
    </div>
  );
}
