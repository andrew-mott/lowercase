import { Fragment } from "react";
import type { AnyEvent, AnyScope } from "@lcase/types";
import { CodeEditor } from "@/components/workbench/shared/CodeEditor";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import { Button } from "@/components/ui/button";
import { Maximize2Icon } from "lucide-react";

function getFieldColor(field: string) {
  const f = field as keyof AnyEvent;
  return fieldColors[f];
}

const fieldColors = {
  id: "text-slate-700 dark:text-slate-200",
  source: "text-pink-700 dark:text-pink-300",
  specversion: "text-pink-800 dark:text-pink-300",
  time: "text-pink-800 dark:text-pink-300",
  type: "",
  subject: "text-pink-800 dark:text-pink-300",
  datacontenttype: "",
  dataschema: "",
  data: "",
  domain: "dark:text-teal-300 text-teal-700",
  entity: "dark:text-teal-300 text-teal-700",
  action: "dark:text-teal-300 text-teal-700",
  traceparent: "dark:text-purple-300 text-purple-700",
  tracestate: "",
  traceid: "dark:text-purple-300 text-purple-700",
  spanid: "dark:text-purple-300 text-purple-700",
  parentspanid: "",
  capid: "",
  engineid: "",
  flowid: "text-neutral-600 dark:text-neutral-400",
  flowversionid: "text-neutral-600 dark:text-neutral-400",
  jobid: "",
  limiterid: "",
  runid: "text-neutral-600 dark:text-neutral-400",
  schedulerid: "",
  stepid: "",
  steptype: "",
  toolid: "",
  workerid: "",
} satisfies Record<keyof AnyEvent | keyof AnyScope, string>;

const fieldOrder = [
  "id",
  "flowid",
  "flowversionid",
  "runid",
  "stepid",
  "jobid",
  "toolid",
  "engineid",
  "capid",
  "limiterid",
  "schedulerid",
  "workerid",
  "time",
  "source",
  "subject",
  "specversion",
  "traceid",
  "spanid",
  "parentspanid",
  "traceparent",
  "tracestate",
  "domain",
  "entity",
  "action",
  "datacontenttype",
  "dataschema",
] as const satisfies (keyof AnyEvent | keyof AnyScope)[];

export function EventDetails({
  event,
  index,
  onOpenInMainPanel,
  onOpenEventPayload,
}: {
  event: AnyEvent | null;
  index?: string;
  onOpenInMainPanel?: OpenInMainPanel;
  // Preferred over onOpenInMainPanel when present -- opens the real
  // event-payload panel (self-fetching, survives a reload) instead of
  // flattening to inline text. Old-mode's callers never pass this.
  onOpenEventPayload?: (eventId: string, label: string) => void;
}) {
  if (!event)
    return (
      <div className="dark:text-neutral-500">
        Select an event in the event graph to view its details.
      </div>
    );

  async function openEvent(title: string, event: AnyEvent) {
    if (onOpenEventPayload) {
      onOpenEventPayload(event.id, title);
      return;
    }
    if (onOpenInMainPanel === undefined) return;
    onOpenInMainPanel(title, JSON.stringify(event, null, 2), "json");
  }
  return (
    <div className="event-expanded text-sm font-mono text-start rounded-xl mb-2 ">
      <p className="flex flex-row justify-between  text-xs font-bold">
        {index && "#" + index + " "}
        {event.type}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => openEvent(`${event.type}`, event)}
          title="Open output in main tab"
        >
          <Maximize2Icon className="size-3.5" />
        </Button>
      </p>

      {/* grid, not flex -- a shared auto column across every row sizes
          itself to the widest label once, so a value that wraps on one row
          can't shrink that row's own label narrower than the rest. minmax(0,
          1fr) on the value column keeps a long unbroken value (e.g. a hash)
          from doing the same in the other direction, forcing the grid wider
          than its container instead of wrapping. */}
      {/* <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
        {fieldOrder.map((key, index) => {
          if (!Object.hasOwn(event, key)) return null;
          return (
            <Fragment key={index + event.id}>
              <div
                className={getFieldColor(key) + " text-xs whitespace-nowrap"}
              >
                [{key}]
              </div>
              <div className={getFieldColor(key) + " text-xs wrap-break-word"}>
                {String(event[key as keyof AnyEvent])}
              </div>
            </Fragment>
          );
        })}
      </div> */}

      <div>
        {fieldOrder.map((key, index) => {
          if (!Object.hasOwn(event, key)) return null;
          return (
            <Fragment key={index + event.id}>
              <div
                className={getFieldColor(key) + " text-xs whitespace-nowrap"}
              >
                {key}
              </div>
              <div
                className={getFieldColor(key) + " text-xs wrap-break-word mb-2"}
              >
                {String(event[key as keyof AnyEvent])}
              </div>
            </Fragment>
          );
        })}
      </div>

      <p className="mt-3 mb-2 text-md">data</p>
      <CodeEditor
        key={event.id}
        value={JSON.stringify(event.data, null, 2)}
        language="json"
        readOnly
        autoHeight
        folding={false}
        fontSize={10}
        lineHeight={1.25}
        lineNumbersMinChars={3}
      />
      <pre className="flex flex-col text-start text-xs dark:text-sky-200 text-sky-700">
        {}
      </pre>
    </div>
  );
}
