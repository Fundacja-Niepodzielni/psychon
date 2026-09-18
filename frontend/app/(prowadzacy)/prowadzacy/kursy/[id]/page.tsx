"use client";

import { use } from "react";
import KursProwadzacego from "@/components/kursy/KursProwadzacego";

export default function InstructorCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return <KursProwadzacego id={id} />;
}
