import { Play } from "lucide-react";
import Card from "@/components/ui/Card";
import type { Onboarding, VideoSection } from "./types";

/** Zamienia typowy link do YouTube/Vimeo na adres do osadzenia w <iframe>. */
function toEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }
    if (url.hostname.endsWith("youtube.com") && url.searchParams.has("v")) {
      return `https://www.youtube.com/embed/${url.searchParams.get("v")}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function VideoBlock({ video }: { video: VideoSection }) {
  if (video.url) {
    return (
      <div className="overflow-hidden rounded-control border border-line bg-ink">
        <div className="relative aspect-video">
          <iframe
            src={toEmbedUrl(video.url)}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-control px-4 py-10 border border-dashed border-control bg-grey text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-pill border border-control bg-card text-icon"
      >
        <Play className="size-6" />
      </span>
      <p className="max-w-sm px-4 text-body text-muted">
        {video.caption ?? "Film pojawi się tutaj wkrótce."}
      </p>
    </div>
  );
}

export interface OnboardingViewProps {
  data: Onboarding;
}

/**
 * Podgląd treści ekranu „Zacznij tutaj" — trzy sekcje (film, przebieg
 * programu, oczekiwania), bez żadnych kontrolek edycji. Używany na
 * `/panel/start` (widok uczestnika) i jako „Podgląd" na `/admin/ekran-startowy`
 * (ten sam render, który zobaczy uczestnik po zapisaniu zmian).
 *
 * Wyróżnione tłem jest tylko powitanie filmowe: to pierwszy krok na tym
 * ekranie. Teksty mają szerokość wygodną do czytania.
 */
export default function OnboardingView({ data }: OnboardingViewProps) {
  return (
    <div className="flex flex-col gap-stack">
      <Card title={data.video.title} warm>
        <VideoBlock video={data.video} />
        {data.video.url && data.video.caption && (
          <p className="mt-3 max-w-2xl text-body text-muted">{data.video.caption}</p>
        )}
      </Card>

      <Card title={data.program.title}>
        <p className="max-w-2xl whitespace-pre-line text-body text-pretty">
          {data.program.body}
        </p>
      </Card>

      <Card title={data.expectations.title}>
        <p className="max-w-2xl whitespace-pre-line text-body text-pretty">
          {data.expectations.body}
        </p>
      </Card>
    </div>
  );
}
