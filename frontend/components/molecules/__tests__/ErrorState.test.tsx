import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorState from "@/components/molecules/ErrorState";

describe("ErrorState", () => {
  it("pokazuje komunikat i wywołuje ponowienie po kliknięciu", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Serwer nie odpowiada." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");

    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("noga negatywna: bez onRetry nie renderuje przycisku ponowienia", () => {
    render(<ErrorState message="Serwer nie odpowiada." />);

    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();
  });
});
