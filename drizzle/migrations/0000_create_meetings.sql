CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Relay meeting',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb,
  summary_generated_at timestamptz
);
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  speaker text NOT NULL,
  content text NOT NULL,
  spoken_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_transcripts_meeting_idx ON public.meeting_transcripts (meeting_id, spoken_at);
GRANT ALL ON public.meeting_transcripts TO service_role;
ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_messages_meeting_idx ON public.meeting_messages (meeting_id, sent_at);
GRANT ALL ON public.meeting_messages TO service_role;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;