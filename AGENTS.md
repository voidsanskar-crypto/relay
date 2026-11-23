<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Relay architecture

- Meetings are name-only (no accounts): the unguessable room code is the access secret, so every meeting server function in `src/lib/meetings.functions.ts` validates the code and reads/writes with the admin client; meeting tables have RLS on with no client policies.
- Live meeting traffic (WebRTC signaling, presence, chat, captions, whiteboard strokes) goes over one realtime broadcast event per room (`relay-room:<code>`, payload typed as `BusEvent` in `src/lib/meeting/bus.ts`) — keeps one channel per participant and one place to add new message types.
- Video is a peer-to-peer mesh using the perfect-negotiation pattern with STUN only; each peer always sends one audio and one video line (placeholder tracks when devices are missing, or an empty transceiver if the browser can't make one) so device changes, blur and screen share swap via `replaceTrack` without renegotiation.
- Transcripts come from the browser's speech recognition on each participant's own mic; chat and final transcript segments are persisted so the AI assistant and post-call summary read them server-side.
- AI calls live in `src/lib/ai/gateway.server.ts` (Responses API via the Lovable AI Gateway, streamed and consumed server-side) and are only reached through server functions.
- React effects always use a block body (`useEffect(() => { ... })`), never an expression body: browser APIs like `scrollIntoView` now return Promises, and React treats a returned value as a cleanup and crashes the page.
- The live call is wrapped in `MeetingErrorBoundary` so a crash inside the meeting offers Rejoin instead of the generic error page.
- Motion lives in `src/styles.css` (spring easing tokens, `animate-*` keyframes, `motion-press` utility, reduced-motion override); components use those classes instead of ad-hoc durations, and looping effects (like the speaker glow) sit on their own layer so they never replace an element's entrance animation.
- AI action-item suggestions run only in the speaker's own browser (cheap phrase check in `src/lib/meeting/action-detect.ts`, then `suggestActionItem`), and are shared over the room bus — so each transcript line is checked once; saved notes reuse the suggestion id so two people saving it make one note.
- Push-to-talk lives in `src/lib/media/use-push-to-talk.ts`; any area where Space must keep its normal meaning (text fields, menus, whiteboard) is skipped via `isTypingTarget` / a `data-no-ptt` attribute.
