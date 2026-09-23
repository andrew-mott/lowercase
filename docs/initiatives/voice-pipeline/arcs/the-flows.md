# Voice Pipeline — Arc A9: The flows (Changes C14–C15)

**Previous:** [Inline runs](./inline-runs.md) (Change C13)

Part of the [`INITIATIVE.md`](../INITIATIVE.md) Change log, split out to keep that doc scannable. This arc is where the Initiative reaches its finish line: real flows, built on everything the arcs before it made possible — binary params and outputs (A6), flow outputs and the outputs/content routes (A7), and inline multipart runs (A8).

**Not in this arc:** naming a flow by name and version (moved to "Not yet scoped" in `INITIATIVE.md` — the real blocker turned out to be flow versioning, not the naming route), and the workbench rendering binary artifacts (its own later arc, A10).

## Change C14 - The transcription, speech, and conversation flows - merged (#406)

### Discussion

Four flows, each reachable by posting one multipart request and reading the result: `transcribe-audio` and `transcribe-correct` reach the Initiative's stated finish line (speech to text, corrected), `speak` is the second goal (text to speech), and `converse` is the "conversation with context" later target flow, reached sooner than expected because it needed nothing the others hadn't already proven.

- **Every step's service address, model name and prompt is a param, not hardcoded.** A flow's `http` step already interpolates a param into its `url`, `body`, and `headers`, so nothing new was needed to make where a step's dependency runs, what model it names, and what it's told to do all caller-supplied rather than baked into the flow. This is the same instinct the Initiative already holds for content — a step declares what it needs and a caller supplies it — extended from just artifacts to configuration.
- **One flow, not several, when only a backend differs.** `speak` can reach either of two text-to-speech services; `converse` can run with a default persona or a caller-supplied one. Once the address, model and prompt are all params, the two cases differ only in what a caller sends, not in the flow's structure — so each stayed one flow rather than becoming two.
- **`transcribe-correct`'s and `converse`'s speech-to-text step uses a non-distilled Whisper model, not the smaller distilled one, and this was an empirical finding, not a guess.** `Systran/faster-distil-whisper-small.en` silently drops or garbles stretches of a longer, natural (paused, rambling) real recording — reproduced directly against the speech server on the same audio, comparing it to `Systran/faster-whisper-small.en`, which transcribed the same recording completely. Not a length cap: the server sets none, and the failure is content loss partway through, not a hard cutoff. The likely cause, from reading the server's own request code: it calls the model with a single fixed decoding temperature and no fallback temperature list, which is the combination Whisper models are known to lose a decode to a repetition or drop under, and distilled models are more prone to it. Not fixed at the server; worked around by choosing the model, which callers can also change since it is a param.
- **Verification is direct against the public HTTP API.** Each flow is uploaded to a running stack and exercised by posting a multipart run request with a real or synthesised audio clip, reading the SSE stream to completion. Nothing else in the repo is needed to check that a flow reaches its result, and what calls these flows in practice is out of scope for this Initiative's docs.

### What actually landed

- **`transcribe-audio`** — params `audio`, `speachesUrl`, `whisperModel`. One step, posts the audio to the speech server's transcription route, exports the response text. Output: `text`.
- **`transcribe-correct`** — params `audio`, `speachesUrl`, `whisperModel`, `llmUrl`, `llmModel`, `llmAuth`, `correctPrompt`. Transcribes, then an LLM step corrects the transcript (misheard technical terms especially) against the caller-supplied prompt. Outputs: `text` (corrected), `transcript` (raw).
- **`speak`** — params `text`, `voice`, `llmUrl`, `llmModel`, `llmAuth`, `formatPrompt`, `ttsUrl`, `ttsModel`. An LLM step rewrites the text so it reads naturally aloud (spelled-out numbers and symbols, no markdown), then a text-to-speech step speaks it. Outputs: `audio`, `spoken` (the text actually spoken, after the rewrite).
- **`converse`** — params `audio`, `history`, `voice`, `system`, `speachesUrl`, `whisperModel`, `llmUrl`, `llmModel`, `llmAuth`, `ttsUrl`, `ttsModel`. One turn per run: transcribes, an LLM step replies given the system prompt and the conversation so far, then speaks the reply. The caller keeps the history and the system prompt and sends both back each turn — the flow itself carries no state between runs. Outputs: `audio`, `heard`, `reply`.
- **Verified** by posting each flow a multipart run request against a live stack and reading its SSE stream to `completed`; `speak`'s and `converse`'s audio output was fetched back through the artifact content route (C12) and confirmed to be valid, playable audio.

### Open

- **C15** — a step's whole non-JSON output as another step's input isn't needed by any of these four flows: a transcript reaches the LLM step through an export, and audio that is a flow's result is returned as an output with no step reading it. Stays unscheduled; see "Referencing a whole step output" in `INITIATIVE.md`.
