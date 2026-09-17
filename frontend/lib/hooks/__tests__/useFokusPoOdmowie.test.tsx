// Test mechanizmu powrotu fokusu po odmowie serwera (Z-15, kryterium F2).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Button from "@/components/ui/Button";
import Form from "@/components/ui/Form";
import Input from "@/components/ui/Input";

type Bledy = Record<string, string[]>;

const ODMOWA: Bledy = {
  title: ["Tytuł jest wymagany."],
  slug: ["Identyfikator jest zajęty."],
};

function Ekran({ odpowiedz }: { odpowiedz: Bledy }) {
  const [bledy, setBledy] = useState<Bledy>({});

  return (
    <Form
      bledyPol={bledy}
      onSubmit={(event) => {
        event.preventDefault();
        setBledy(odpowiedz);
      }}
    >
      <Input label="Nazwa" error={bledy.name?.[0]} />
      <Input label="Tytuł" error={bledy.title?.[0]} />
      <Input label="Identyfikator" error={bledy.slug?.[0]} />
      <Button type="submit">Zapisz</Button>
    </Form>
  );
}

describe("powrót fokusu po odmowie serwera", () => {
  it("po odpowiedzi z błędami pól fokus stoi na pierwszym błędnym polu", async () => {
    const osoba = userEvent.setup();
    render(<Ekran odpowiedz={ODMOWA} />);

    await osoba.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText("Tytuł jest wymagany.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Tytuł"));
  });

  it("pole bez błędu fokusu nie dostaje", async () => {
    const osoba = userEvent.setup();
    render(<Ekran odpowiedz={ODMOWA} />);

    await osoba.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(document.activeElement).not.toBe(screen.getByLabelText("Nazwa"));
    expect(document.activeElement).not.toBe(
      screen.getByLabelText("Identyfikator"),
    );
  });

  it("udana wysyłka fokusu nie przenosi", async () => {
    const osoba = userEvent.setup();
    render(<Ekran odpowiedz={{}} />);

    const przycisk = screen.getByRole("button", { name: "Zapisz" });
    await osoba.click(przycisk);

    expect(document.activeElement).toBe(przycisk);
  });
});
