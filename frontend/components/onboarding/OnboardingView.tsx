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
      <div className="overflow-hidden rounded-sm border border-line bg-ink">
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
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-line bg-grey text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-pill bg-card text-primary shadow-card"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <p className="max-w-sm px-4 text-small text-muted">
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
 */
export default function OnboardingView({ data }: OnboardingViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card title={data.video.title}>
        <VideoBlock video={data.video} />
        {data.video.url && data.video.caption && (
          <p className="mt-3 text-small text-muted">{data.video.caption}</p>
        )}
      </Card>

      <Card title={data.program.title}>
        <p className="whitespace-pre-line text-body text-muted">
          {data.program.body}
        </p>
      </Card>

      <Card title={data.expectations.title} warm>
        <p className="whitespace-pre-line text-body text-muted">
          {data.expectations.body}
        </p>
      </Card>
    </div>
  );
}
