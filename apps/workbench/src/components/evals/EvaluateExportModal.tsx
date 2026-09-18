// Kept intentionally after the old-page cleanup removed its only caller; this
// is not dead code to sweep. It is v1
// evals' judge-trigger UI, preserved as a reference for what to compare
// against when building the real evals rework. See docs/todo.md for what's
// actually wrong with it and what a real fix looks like.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useGetFlowsQuery } from "@/redux/api/flows-api";
import { useRequestEvalMutation } from "@/redux/api/evals-api";
import { useCreateArtifactMutation } from "@/redux/api/artifacts-api";

export type EvaluateExportTarget = {
  runId: string;
  stepId: string;
  exportName: string;
};

// mirrors examples/eval-judge.system.prompt.md so this quick-trigger path
// stays consistent with the rubric shape the rest of the eval system expects
// -- not every eval flow's judge step will match this schema, so treat it as
// a starting point to edit per flow, not a universal default (see docs/todo.md)
const DEFAULT_SYSTEM_PROMPT = `You are a rubric-based evaluator.

You will be given a Question, some Context, and an Answer, each in their own labeled section. Score the Answer against these dimensions, each from 0 to 1:

- correctness: is the Answer factually consistent with the Context?
- faithfulness: does it avoid inventing information not present in the Context?
- completeness: does it address the Question, without major omissions?
- format: is it clear, well-structured, and free of stray artifacts (e.g. leftover JSON, broken formatting)?

If a section is empty or missing, judge only what you can from what's given -- do not penalize the Answer for a missing Question or Context.

Return exactly one JSON object and nothing else, matching this shape:

{
  "overall": 0.0,
  "passed": false,
  "dimensions": {
    "correctness": { "score": 0.0, "rationale": "" },
    "faithfulness": { "score": 0.0, "rationale": "" },
    "completeness": { "score": 0.0, "rationale": "" },
    "format": { "score": 0.0, "rationale": "" }
  },
  "rationale": ""
}

"overall" is your holistic judgment, not necessarily the average of the dimensions. "passed" is true only if the answer is good enough to show a real user without embarrassment.

Do not explain outside the JSON. Do not apologize. Do not answer the question yourself.`;

export function EvaluateExportModal({
  target,
  onClose,
}: {
  target: EvaluateExportTarget;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: flowsRes } = useGetFlowsQuery();
  const evalFlows = (flowsRes?.ok ? flowsRes.value : []).filter(
    (f) => f.flow.kind === "eval",
  );

  const [evalFlowId, setEvalFlowId] = useState<string>();
  const [experimentId, setExperimentId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [error, setError] = useState<string>();

  const [createArtifact, createState] = useCreateArtifactMutation();
  const [requestEval, requestState] = useRequestEvalMutation();

  const selectedFlow = evalFlows.find((f) => f.flow.id === evalFlowId);
  const isSubmitting = createState.isLoading || requestState.isLoading;

  const handleSubmit = async () => {
    setError(undefined);
    if (!selectedFlow) {
      setError("Select an eval flow");
      return;
    }

    const uploadResult = await createArtifact({
      kind: "authored",
      contentType: "text/markdown",
      value: systemPrompt,
      metadata: { label: "judge system prompt" },
    }).unwrap();
    if (!uploadResult.ok) {
      setError(uploadResult.error);
      return;
    }

    const result = await requestEval({
      targets: [
        {
          runId: target.runId,
          stepId: target.stepId,
          exportName: target.exportName,
          paramName: "subjectAnswer",
        },
      ],
      evalFlowId: selectedFlow.flow.id,
      evalFlowVersionId: selectedFlow.latestVersion.id,
      evalFlowDefHash: selectedFlow.latestVersion.definitionHash,
      judgeSystemPromptHash: uploadResult.value.hash,
      ...(experimentId ? { experimentId } : {}),
    }).unwrap();

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    navigate(`/runs/details?runId=${result.evalRunId}`);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Evaluate this export</DialogTitle>
          <DialogDescription>
            step: {target.stepId} &middot; export: {target.exportName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Eval flow</Label>
            <Select value={evalFlowId} onValueChange={setEvalFlowId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an eval flow" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="w-[var(--radix-select-trigger-width)]"
              >
                <SelectGroup>
                  <SelectLabel>Select an eval flow</SelectLabel>
                  {evalFlows.map((f) => (
                    <SelectItem value={f.flow.id} key={f.flow.id}>
                      {f.flow.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Judge system prompt</Label>
            <textarea
              className="w-full min-h-[8rem] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Experiment id (optional)</Label>
            <Input
              value={experimentId}
              onChange={(e) => setExperimentId(e.target.value)}
              placeholder="experiment id"
            />
          </div>

          {error ? (
            <div className="text-destructive text-sm">{error}</div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="cursor-pointer"
          >
            {isSubmitting ? "Starting..." : "Start Eval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
