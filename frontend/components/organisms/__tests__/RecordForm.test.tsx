import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import RecordForm, { type RecordFormField } from "@/components/organisms/RecordForm";

const pola: RecordFormField[] = [
  { name: "imie", label: "Imię", required: true },
  { name: "email", label: "E-mail", type: "email", required: true },
];

describe("RecordForm", () => {
  it("render w spoczynku: pola z etykietami, bez błędów", () => {
    render(
      <RecordForm fields={pola} values={{}} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(screen.getByLabelText("Imię")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("odmowa dwóch pól: aria-invalid='true' na obu polach", () => {
    render(
      <RecordForm
        fields={pola}
        values={{ imie: "", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ imie: "Podaj imię.", email: "Podaj poprawny adres e-mail." }}
      />,
    );

    expect(screen.getByLabelText("Imię")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("odmowa dwóch pól: dwa odnośniki w podsumowaniu błędów, wskazujące pola", () => {
    render(
      <RecordForm
        fields={pola}
        values={{ imie: "", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ imie: "Podaj imię.", email: "Podaj poprawny adres e-mail." }}
      />,
    );

    const podsumowanie = screen.getByText("Popraw błędy w formularzu").closest("div")!;
    const odnosniki = within(podsumowanie).getAllByRole("link");
    expect(odnosniki).toHaveLength(2);

    const imieInput = screen.getByLabelText("Imię");
    const emailInput = screen.getByLabelText("E-mail");
    expect(odnosniki[0]).toHaveAttribute("href", `#${imieInput.id}`);
    expect(odnosniki[1]).toHaveAttribute("href", `#${emailInput.id}`);
  });

  it("pole bez błędu nie ma aria-invalid", () => {
    render(
      <RecordForm
        fields={pola}
        values={{ imie: "Jan", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ email: "Podaj poprawny adres e-mail." }}
      />,
    );

    expect(screen.getByLabelText("Imię")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("odmowa dwóch pól: aria-describedby wskazuje komunikat błędu tego pola", () => {
    render(
      <RecordForm
        fields={pola}
        values={{ imie: "", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ imie: "Podaj imię.", email: "Podaj poprawny adres e-mail." }}
      />,
    );

    const imieInput = screen.getByLabelText("Imię");
    const emailInput = screen.getByLabelText("E-mail");

    const imieOpis = imieInput.getAttribute("aria-describedby");
    const emailOpis = emailInput.getAttribute("aria-describedby");

    expect(imieOpis).toBeTruthy();
    expect(emailOpis).toBeTruthy();
    expect(document.getElementById(imieOpis!)).toHaveTextContent("Podaj imię.");
    expect(document.getElementById(emailOpis!)).toHaveTextContent(
      "Podaj poprawny adres e-mail.",
    );
  });

  it("po pojawieniu się błędów fokus trafia na pierwsze błędne pole", () => {
    const { rerender } = render(
      <RecordForm fields={pola} values={{}} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    rerender(
      <RecordForm
        fields={pola}
        values={{ imie: "", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ imie: "Podaj imię.", email: "Podaj poprawny adres e-mail." }}
      />,
    );

    expect(screen.getByLabelText("Imię")).toHaveFocus();
  });

  it("gdy pierwsze pole jest poprawne, a drugie błędne, fokus trafia na drugie (błędne) pole", () => {
    const { rerender } = render(
      <RecordForm fields={pola} values={{ imie: "Jan" }} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    rerender(
      <RecordForm
        fields={pola}
        values={{ imie: "Jan", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ email: "Podaj poprawny adres e-mail." }}
      />,
    );

    expect(screen.getByLabelText("E-mail")).toHaveFocus();
    expect(screen.getByLabelText("Imię")).not.toHaveFocus();
  });

  it("axe: 0 naruszeń na formularzu z odmową dwóch pól", async () => {
    const { container } = render(
      <RecordForm
        fields={pola}
        values={{ imie: "", email: "zle" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        fieldErrors={{ imie: "Podaj imię.", email: "Podaj poprawny adres e-mail." }}
      />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
