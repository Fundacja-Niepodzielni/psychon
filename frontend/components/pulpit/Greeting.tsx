/** Nagłówek pulpitu — powitanie imieniem. */
export default function Greeting({ firstName }: { firstName: string }) {
  const name = firstName.trim();

  return (
    <header className="flex flex-col gap-2">
      <p className="text-caption font-medium uppercase tracking-[0.06em] text-subtle">
        Pulpit
      </p>
      <h1 className="text-h1 font-black text-ink">
        {name ? `Dzień dobry, ${name}` : "Dzień dobry"}
      </h1>
      <p className="max-w-2xl text-body text-muted">
        To Twoje miejsce na dziś. Bez pośpiechu — poniżej znajdziesz następny krok
        i podgląd całej ścieżki.
      </p>
    </header>
  );
}
