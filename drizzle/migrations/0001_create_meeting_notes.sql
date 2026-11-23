CREATE TABLE public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  owner text CHECK (owner IS NULL OR char_length(owner) <= 80),
  due text CHECK (due IS NULL OR char_length(due) <= 80),
  added_by text NOT NULL CHECK (char_length(added_by) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.meeting_notes TO service_role;

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX meeting_notes_meeting_id_created_at_idx ON public.meeting_notes (meeting_id, created_at);