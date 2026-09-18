import { CodeEditor } from "@/components/workbench/shared/CodeEditor";
import { useGetAllRunEventsQuery } from "@/redux/api/runs-api";
import { selectEventById } from "@/redux/slices/events-slice";
import { useAppSelector } from "@/redux/typed-hooks";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";

// Keyed by {runId, eventId}, not eventId alone -- self-fetches this run's
// events (same query use-run-events-with-status.ts already uses, which
// backfills the same events slice this reads from) so the panel survives a
// reload instead of depending on whatever's already buffered live.
export function Content({
  runId,
  eventId,
}: {
  runId: string;
  eventId: string;
}) {
  const { isFetching } = useGetAllRunEventsQuery({ runId });
  const showLoading = useDelayedLoading(isFetching);
  const event = useAppSelector((s) => selectEventById(s, eventId));

  if (!event && isFetching) {
    return showLoading ? <div className="p-4">Loading event...</div> : null;
  }
  if (!event) {
    return <div className="p-4 text-sm text-destructive">Event not found.</div>;
  }

  return (
    <CodeEditor
      language="json"
      value={JSON.stringify(event, null, 2)}
      height="100%"
      readOnly
    />
  );
}
