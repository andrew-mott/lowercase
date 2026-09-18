import type { AnyEvent } from "@lcase/types";

export function ObsEventDetails({ event }: { event: AnyEvent }) {
  return (
    <div className="event-expanded text-md mt-2 font-mono text-start p-5 rounded-xl mb-2 ">
      <p className="text-slate-200">[id] {event.id}</p>
      <p className="text-pink-300">[time] {event.time}</p>
      <p className="text-pink-200">[source] {event.source}</p>
      <p className="text-orange-300">[traceid] {event.traceid}</p>
      <p className="text-orange-300">[spanid] {event.spanid}</p>
      <p className="text-orange-300">[traceparent] {event.traceparent}</p>
      <p className="text-blue-200">[domain] {event.domain}</p>
      <p className="text-blue-200">[action] {event.action}</p>
      <p className="text-blue-200">
        [entity] {event.entity === undefined ? "undefined" : event.entity}
      </p>
      <pre className="flex flex-col text-start text-cyan-200">
        [data] {JSON.stringify(event.data, null, 2)}
      </pre>
    </div>
  );
}
