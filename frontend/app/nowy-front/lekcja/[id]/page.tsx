import { Lekcja } from "@/nowy-front/lekcja/Lekcja";
import style from "./strona.module.css";

/**
 * Route `/nowy-front/lekcja/[id]` — lesson screen (H06). Read and
 * completion both run from the browser (`Lekcja.tsx`), same reason as
 * `/nowy-front/po-programie`.
 */
export default async function StronaLekcji({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className={style.pole}>
      <Lekcja id={id} />
    </div>
  );
}
