import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { Lobby } from "@/components/relay/Lobby";
import { MeetingErrorBoundary } from "@/components/relay/MeetingErrorBoundary";
import { MeetingRoom } from "@/components/relay/MeetingRoom";
import { RelayLogo } from "@/components/relay/RelayLogo";
import { Button } from "@/components/ui/button";
import { useLocalMedia } from "@/lib/media/use-local-media";
import { getMeetingRecord } from "@/lib/meetings.functions";
import { readDisplayName, rememberRoom, saveDisplayName } from "@/lib/recent-rooms";
import { isValidRoomCode } from "@/lib/room-code";
import { cn } from "@/lib/utils";

export const meetingRecordQuery = (code: string) =>
  queryOptions({
    queryKey: ["meeting-record", code],
    queryFn: () => getMeetingRecord({ data: { code } }),
  });

export const Route = createFileRoute("/r/$code")({
  beforeLoad: ({ params }) => {
    if (!isValidRoomCode(params.code)) throw notFound();
  },
  loader: async ({ context, params }) => {
    const record = await context.queryClient.ensureQueryData(meetingRecordQuery(params.code));
    if (!record) throw notFound();
    return { title: record.meeting.title };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? "Meeting";
    return {
      meta: [
        { title: `${title} · Relay` },
        {
          name: "description",
          content: `You're invited to join “${title}” on Relay. No account needed.`,
        },
        { property: "og:title", content: `Join ${title} on Relay` },
        {
          property: "og:description",
          content: "Tap the link to preview your camera and join the room.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: RoomPage,
  errorComponent: RoomLoadError,
  notFoundComponent: RoomNotFound,
});

function RoomPage() {
  const { code } = Route.useParams();
  const { data } = useSuspenseQuery(meetingRecordQuery(code));
  const navigate = useNavigate();
  const media = useLocalMedia();
  const [name, setName] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");

  useEffect(() => {
    setSavedName(readDisplayName());
  }, []);
  useEffect(() => {
    if (data) rememberRoom({ code: data.meeting.code, title: data.meeting.title });
  }, [data]);

  if (!data) return <RoomNotFound />;

  if (!name) {
    return (
      <Lobby
        key={savedName}
        meeting={data.meeting}
        media={media}
        initialName={savedName}
        onJoin={(n) => {
          saveDisplayName(n);
          enterRoom(() => setName(n));
        }}
      />
    );
  }

  const goToSummary = () => void navigate({ to: "/summary/$code", params: { code } });
  return (
    <MeetingErrorBoundary
      onLeave={() => {
        media.stopAll();
        goToSummary();
      }}
    >
      <div className={cn("h-dvh", !supportsViewTransition() && "animate-room-enter")}>
        <MeetingRoom
          meeting={data.meeting}
          media={media}
          name={name}
          initialMessages={data.messages}
          initialTranscript={data.transcript}
          initialNotes={data.notes}
          onLeave={goToSummary}
        />
      </div>
    </MeetingErrorBoundary>
  );
}

function supportsViewTransition() {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

/** Crossfades the lobby into the room where the browser supports it; otherwise the room fades in on its own. */
function enterRoom(update: () => void) {
  if (!supportsViewTransition() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

function RoomNotFound() {
  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <RelayLogo />
      <div>
        <h1 className="font-display text-3xl font-semibold">This room doesn't exist</h1>
        <p className="mt-2 text-muted-foreground">
          Check the link you were sent, or start a fresh room.
        </p>
      </div>
      <Button asChild size="lg">
        <Link to="/">Start a new room</Link>
      </Button>
    </div>
  );
}

function RoomLoadError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <RelayLogo />
      <div>
        <h1 className="font-display text-3xl font-semibold">We couldn't open this room</h1>
        <p className="mt-2 text-muted-foreground">
          {error instanceof Error ? error.message : "Something went wrong while loading the room."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="lg"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link to="/">Start a new room</Link>
        </Button>
      </div>
    </div>
  );
}
