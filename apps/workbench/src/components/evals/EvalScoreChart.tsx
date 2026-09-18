import type { EChartsOption } from "echarts";
import EChartsReact from "echarts-for-react";
import type { EvalResultRecord } from "@lcase/types";

export function EvalScoreChart({ results }: { results: EvalResultRecord[] }) {
  if (results.length === 0) return null;

  const sorted = [...results].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const option: EChartsOption = {
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const index = p.dataIndex ?? 0;
        const r = sorted[index];
        if (!r) return "";
        return (
          `target run: ${r.targetRunId}<br/>` +
          `target flow version: ${r.targetFlowVersionId ?? "-"}<br/>` +
          `overall: ${r.overall.toFixed(2)}<br/>` +
          `passed: ${r.passed ? "yes" : "no"}`
        );
      },
    },
    grid: [{ left: 60, right: 60, top: 60, bottom: 60 }],
    xAxis: {
      type: "category",
      data: sorted.map((r) =>
        new Date(r.createdAt).toLocaleString("en-us", { dateStyle: "short" }),
      ),
      axisLabel: { rotate: 0 },
    },
    yAxis: {
      type: "value",
      name: "overall",
      min: 0,
      max: 1,
    },
    series: [
      {
        type: "bar",
        data: sorted.map((r) => ({
          value: r.overall,
          itemStyle: { color: r.passed ? "#34d399" : "#d3344a" },
        })),
      },
    ],
  };

  return (
    <div className="w-full h-[500px]">
      <EChartsReact
        option={option}
        style={{ height: "100%", width: "100%" }}
        className="rounded-xl bg-neutral-800 dark:bg-neutral-800"
      />
    </div>
  );
}
