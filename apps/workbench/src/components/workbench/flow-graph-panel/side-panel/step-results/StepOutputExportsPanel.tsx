import { Maximize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyGetArtifactQuery } from "@/redux/api/artifacts-api";
import type { OpenInMainPanel } from "@/components/workbench/shared/MainPanelTypes";
import type { StepRunInfo } from "@/components/workbench/shared/flow-graph/use-step-run-info";
import {
  artifactFormatToLanguage,
  type ParamArtifactContent,
} from "@/components/workbench/shared/ref-resolution";
import { stringifyForPreview } from "@/components/workbench/flow-graph-panel/side-panel/step-results/preview-text";
import { CodeEditor } from "@/components/workbench/shared/CodeEditor";

type Props = {
  stepId: string;
  stepRunInfo: StepRunInfo | undefined;
  artifactsByHash: Record<string, ParamArtifactContent>;
  onOpenInMainPanel: OpenInMainPanel;
  // Preferred over onOpenInMainPanel when present -- opens the real
  // artifact panel by hash instead of fetching content just to flatten it
  // to inline text (the artifact panel does its own fetching).
  onOpenArtifact?: (hash: string, label: string) => void;
};

// display the outputs and exports of a panel, resolving artifact content
// lazily
export function StepOutputExportsPanel({
  stepId,
  stepRunInfo,
  artifactsByHash,
  onOpenInMainPanel,
  onOpenArtifact,
}: Props) {
  const [triggerGetArtifact, { isFetching }] = useLazyGetArtifactQuery();

  if (!stepRunInfo || stepRunInfo.status === "initialized") {
    return (
      <p className="mt-1 text-sm text-muted-foreground">
        Step "{stepId}" hasn't run in this run yet.
      </p>
    );
  }

  async function openHash(title: string, hash: string) {
    if (onOpenArtifact) {
      onOpenArtifact(hash, title);
      return;
    }
    const result = await triggerGetArtifact({ hash });
    if (!result.data?.ok || result.data.format === "bytes") return;
    const data = result.data;
    const value =
      data.format === "json" ? JSON.stringify(data.value, null, 2) : data.value;
    onOpenInMainPanel(title, value, artifactFormatToLanguage(data.format));
  }

  function renderPreview(hash: string) {
    const artifact = artifactsByHash[hash];
    if (!artifact) {
      return <div className="text-xs text-muted-foreground">Loading…</div>;
    }
    return (
      <CodeEditor
        key={hash}
        value={stringifyForPreview(artifact.value)}
        language={artifactFormatToLanguage(artifact.format)}
        readOnly
        autoHeight
        folding={false}
        fontSize={10}
        lineHeight={1.25}
        lineNumbersMinChars={3}
      />
    );
  }

  function truncateHash(hash: string) {
    return hash.slice(0, 12) + "..";
  }

  const exportEntries = Object.entries(stepRunInfo.exportHashes ?? {});

  return (
    <div className="flex flex-col gap-3">
      {stepRunInfo.status === "running" ? (
        <p className="text-sm text-muted-foreground">Step is running…</p>
      ) : null}

      {stepRunInfo.status === "failed" ? (
        <div>
          <div className="font-medium text-sm text-error-foreground mb-2">
            Failed
          </div>
          <p className="text-xs text-error-foreground whitespace-pre-wrap">
            {stepRunInfo.reason}
          </p>
        </div>
      ) : null}

      {stepRunInfo.outputHash ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold">Output</span>
              <span className="text-xs font-mono">
                &nbsp;{truncateHash(stepRunInfo.outputHash)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              disabled={isFetching}
              onClick={() =>
                openHash(`Step "${stepId}" output`, stepRunInfo.outputHash!)
              }
              title="Open output in main tab"
            >
              <Maximize2Icon className="size-3.5" />
            </Button>
          </div>
          {renderPreview(stepRunInfo.outputHash)}
        </div>
      ) : null}

      {exportEntries.length > 0 ? (
        <div className="flex flex-col mt-1 mb-0">
          <span className="text-xs font-bold">Exports</span>
          {exportEntries.map(([name, hash]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-medium">{name}</span>
                  <span className="text-xs font-mono">
                    &nbsp;{truncateHash(hash)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={isFetching}
                  onClick={() =>
                    openHash(`Step "${stepId}" export "${name}"`, hash)
                  }
                  title={`Open export "${name}" in main tab`}
                >
                  <Maximize2Icon className="size-3.5" />
                </Button>
              </div>
              {renderPreview(hash)}
            </div>
          ))}
        </div>
      ) : null}

      {!stepRunInfo.outputHash &&
      exportEntries.length === 0 &&
      stepRunInfo.status === "completed" ? (
        <p className="text-sm text-muted-foreground">
          Step completed with no output or exports.
        </p>
      ) : null}
    </div>
  );
}
