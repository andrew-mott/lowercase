import { useState } from "react";
import {
  EvalTargetPicker,
  type EvalTargetShape,
} from "@/components/evals/EvalTargetPicker";
import { EvalResultTable } from "@/components/evals/EvalResultTable";
import { EvalScoreChart } from "@/components/evals/EvalScoreChart";
import { Input } from "@/components/ui/input";
import {
  useListEvalsByExperimentIdQuery,
  useListEvalsByTargetShapeQuery,
} from "@/redux/api/evals-api";
import { skipToken } from "@reduxjs/toolkit/query";

export function Evals() {
  const [target, setTarget] = useState<Partial<EvalTargetShape>>({});
  const [experimentId, setExperimentId] = useState("");

  const isCompleteTarget =
    !!target.flowId && !!target.stepId && !!target.exportName;

  const { data: byShapeRes } = useListEvalsByTargetShapeQuery(
    isCompleteTarget && !experimentId
      ? {
          flowId: target.flowId!,
          stepId: target.stepId!,
          exportName: target.exportName!,
        }
      : skipToken,
  );
  const { data: byExperimentRes } = useListEvalsByExperimentIdQuery(
    experimentId ? { experimentId } : skipToken,
  );

  const data = experimentId ? byExperimentRes : byShapeRes;
  const results = data?.ok ? data.value : [];

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-5">Evals</h2>

      <div className="flex flex-col gap-4 mb-6">
        <EvalTargetPicker value={target} onChange={setTarget} />

        <div className="flex items-center gap-3">
          <div className="text-md font-medium">Or filter by experiment id:</div>
          <Input
            className="w-[16rem]"
            value={experimentId}
            onChange={(e) => setExperimentId(e.target.value)}
            placeholder="experiment id"
          />
        </div>
      </div>

      {data && !data.ok ? <div>Error loading evals: {data.error}</div> : null}

      {results.length > 0 ? (
        <div className="flex flex-col gap-6">
          <EvalScoreChart results={results} />
          <EvalResultTable results={results} />
        </div>
      ) : (
        <div>
          {isCompleteTarget || experimentId
            ? "No eval results yet for this selection."
            : "Select a flow, step, and export -- or enter an experiment id -- to browse eval results."}
        </div>
      )}
    </div>
  );
}
