import type { EvalResultRecord } from "@lcase/types";

export function EvalResultTable({ results }: { results: EvalResultRecord[] }) {
  if (results.length === 0) return <div>No eval results yet</div>;

  const dimensionNames = Array.from(
    new Set(results.flatMap((r) => Object.keys(r.payload.dimensions ?? {}))),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-2">Target Run</th>
            <th className="p-2">Target Flow Version</th>
            <th className="p-2">Evaluator Flow Version</th>
            <th className="p-2">Overall</th>
            <th className="p-2">Passed</th>
            {dimensionNames.map((name) => (
              <th className="p-2" key={name}>
                {name}
              </th>
            ))}
            <th className="p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr className="border-b border-border/50" key={r.id}>
              <td className="p-2 font-mono text-xs">{r.targetRunId}</td>
              <td className="p-2 font-mono text-xs">
                {r.targetFlowVersionId ?? "-"}
              </td>
              <td className="p-2 font-mono text-xs">
                {r.evalFlowVersionId ?? "-"}
              </td>
              <td className="p-2">{r.overall.toFixed(2)}</td>
              <td className="p-2">{r.passed ? "yes" : "no"}</td>
              {dimensionNames.map((name) => (
                <td className="p-2" key={name}>
                  {r.payload.dimensions?.[name]?.score.toFixed(2) ?? "-"}
                </td>
              ))}
              <td className="p-2 text-xs">
                {new Date(r.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
