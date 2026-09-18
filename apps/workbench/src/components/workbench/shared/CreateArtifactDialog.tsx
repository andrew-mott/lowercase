import { useRef, useState } from "react";
import type {
  ArtifactUpdateMetadata,
  FlowParamContentType,
} from "@lcase/types";
import {
  defaultContentTypeForFormat,
  isArtifactCompatible,
} from "@lcase/flow-analysis";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IdentityField } from "@/components/workbench/shared/fields/IdentityField";
import { InputField } from "@/components/workbench/shared/fields/InputField";
import { SwitchField } from "@/components/workbench/shared/fields/SwitchField";
import { CuratedParamsField } from "@/components/workbench/shared/fields/CuratedParamsField";
import { useGetFlowVersionDefQuery } from "@/redux/api/flows-api";
import {
  artifactsApi,
  useCreateArtifactMutation,
} from "@/redux/api/artifacts-api";
import { useAppDispatch } from "@/redux/typed-hooks";
import { paramHashSet } from "@/redux/slices/flow-graph-panels-slice";
import { detectFileFormat } from "@/components/workbench/shared/detect-file-format";
import { formatBytes } from "@/components/workbench/shared/format-bytes";
import { useDockviewApi } from "@/components/workbench/dock/dock-context";
import { openOrFocusPanel } from "@/components/workbench/dock/dock-panels";
import { titleFor } from "./artifact-title";
import { TextCursorIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

// narrows the file picker's own filter to just the target param's declared
// type, when arriving via the Run Input picker's create-shortcut -- a soft
// hint only (drag-and-drop or "all files" can bypass it), so handleFileChange
// still verifies the actual picked file below.
const CONTENT_TYPE_ACCEPT: Record<FlowParamContentType, string> = {
  "application/json": ".json,application/json",
  "text/plain": ".txt,text/plain",
  "text/markdown": ".md,text/markdown",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  // pre-checks this param in the curation field on fresh open -- set by the
  // Run Input picker's create-shortcut (the related change), unset for the tree's plain
  // "+" entry point.
  initialCuratedParamName?: string;
  // where to auto-select the created artifact's hash, if this dialog was
  // opened from a specific param's create-shortcut rather than the tree.
  returnTo?: { panelId: string; paramName: string };
};

// "Upload a file" stays entirely in this dialog -- small enough that a
// modal is plenty, no dockview panel needed (see the related change in
// docs/initiatives/ui-workspace/INITIATIVE.md). "Create" instead closes this and
// opens a real panel (needs Monaco, needs real room) -- see
// artifact-authoring-panel/Content.tsx.
export function CreateArtifactDialog({
  open,
  onOpenChange,
  versionId,
  initialCuratedParamName,
  returnTo,
}: Props) {
  const [step, setStep] = useState<"choose" | "upload">("choose");
  const dispatch = useAppDispatch();
  const dockviewApi = useDockviewApi();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: versionData } = useGetFlowVersionDefQuery(versionId);
  const flowDef = versionData?.ok ? versionData.value.definition : null;
  const version = versionData?.ok ? versionData.value.version : null;
  const targetParamDef = returnTo
    ? flowDef?.params?.[returnTo.paramName]
    : undefined;

  const [createArtifact, { isLoading: isSaving }] = useCreateArtifactMutation();
  const [file, setFile] = useState<File | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [share, setShare] = useState(false);
  const [curatedParamNames, setCuratedParamNames] = useState<string[]>([]);

  const reset = () => {
    setStep("choose");
    setFile(null);
    setPickError(null);
    setSaveError(null);
    setLabel("");
    setShare(false);
    setCuratedParamNames(
      initialCuratedParamName ? [initialCuratedParamName] : [],
    );
  };

  // Reset only when a fresh open begins, never on close -- resetting on
  // close would flip content (e.g. back to the "choose" step) while
  // DialogContent is still mounted and fading out, making the close
  // transition look like a second dialog appearing then disappearing.
  // React's "adjust state during render when a prop changes" pattern
  // (not an effect -- setState directly in an effect body is disallowed
  // by this repo's lint config, and would cost an extra render anyway).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) reset();
  }

  function handleAuthor() {
    if (!dockviewApi) return;
    openOrFocusPanel(dockviewApi, {
      kind: "artifact-authoring",
      label: "New Artifact",
      versionId,
      returnTo,
    });
    onOpenChange(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSaveError(null);
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      setPickError(null);
      return;
    }
    const pickedFormat = detectFileFormat(picked);
    if (pickedFormat === "bytes") {
      setFile(null);
      const message =
        "Unsupported file type -- only JSON, text, and Markdown files are supported right now.";
      setPickError(message);
      toast.error(message, { position: "top-center" });
      e.target.value = "";
      return;
    }
    if (
      targetParamDef &&
      !isArtifactCompatible(
        defaultContentTypeForFormat(pickedFormat),
        targetParamDef.type,
      )
    ) {
      setFile(null);
      const message = `This file doesn't match the required type for "${returnTo?.paramName}". Try a different file.`;
      setPickError(message);
      toast.error(message, { position: "top-center" });
      e.target.value = "";
      return;
    }
    setPickError(null);
    setFile(picked);
  }

  const format = file ? detectFileFormat(file) : undefined;
  const compatibleParams =
    flowDef && file && format
      ? Object.fromEntries(
          Object.entries(flowDef.params ?? {}).filter(([, def]) =>
            isArtifactCompatible(defaultContentTypeForFormat(format), def.type),
          ),
        )
      : undefined;

  async function handleSave() {
    if (!file || !version) return;
    setSaveError(null);
    // Filtered here, not pruned as curatedParamNames changes -- picking a
    // different file and back should leave a previously-checked param
    // still checked, so only what's *currently* compatible (the same set
    // CuratedParamsField is already rendering checkboxes for) gets sent.
    const validCuratedParamNames = curatedParamNames.filter(
      (name) => compatibleParams && name in compatibleParams,
    );
    const metadata: ArtifactUpdateMetadata = {
      label: label.trim() ? label.trim() : null,
      flowId: share ? version.flowId : null,
      flowVersionId: versionId,
      paramCurations: validCuratedParamNames,
    };
    try {
      const result = await createArtifact({
        kind: "file",
        file,
        metadata,
      }).unwrap();
      if (result.ok) {
        const associations = {
          flowId: metadata.flowId ?? undefined,
          flowVersionId: versionId,
          curated: true,
          paramCurations: validCuratedParamNames.map((paramName) => ({
            flowVersionId: versionId,
            paramName,
          })),
        };
        dispatch(
          artifactsApi.util.updateQueryData(
            "listArtifacts",
            { flowVersionId: versionId, curated: "true" },
            (list) => {
              if (!list.ok) return;
              list.value.push({ artifact: result.value, associations });
            },
          ),
        );
        if (dockviewApi) {
          openOrFocusPanel(dockviewApi, {
            kind: "artifact",
            label: titleFor({ artifact: result.value, associations }),
            hash: result.value.hash,
            versionId,
          });
        }
        if (
          returnTo &&
          targetParamDef &&
          isArtifactCompatible(result.value.contentType, targetParamDef.type)
        ) {
          dispatch(
            paramHashSet({
              panelId: returnTo.panelId,
              name: returnTo.paramName,
              hash: result.value.hash,
            }),
          );
        }
        toast.success(
          `Created artifact "${titleFor({ artifact: result.value, associations })}"`,
        );
        onOpenChange(false);
      } else {
        setSaveError(result.error);
        toast.error(result.error, { position: "top-center" });
      }
    } catch {
      setSaveError("Failed to create artifact. Please try again.");
      toast.error("Failed to create artifact. Please try again.", {
        position: "top-center",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 bg-background dark:bg-neutral-875">
        <DialogHeader>
          <DialogTitle>New artifact</DialogTitle>
        </DialogHeader>

        {step === "choose" ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer justify-start  hover:bg-lime-200"
              onClick={() => setStep("upload")}
            >
              <UploadIcon />
              Upload a file
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer justify-start hover:bg-lime-200"
              onClick={handleAuthor}
            >
              <TextCursorIcon />
              Create a file
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={
                targetParamDef
                  ? CONTENT_TYPE_ACCEPT[targetParamDef.type]
                  : ".json,.txt,.md,application/json,text/plain,text/markdown"
              }
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer hover:bg-sky-200"
              >
                Browse...
              </Button>
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "No file selected"}
              </p>
            </div>
            {pickError && (
              <p className="text-xs text-destructive">{pickError}</p>
            )}

            {file && (
              <>
                <IdentityField label="Content Type" value={file.type} />
                <IdentityField label="Size" value={formatBytes(file.size)} />
              </>
            )}

            <InputField label="Label" value={label} onChange={setLabel} />
            <SwitchField label="Share" value={share} onChange={setShare} />
            <CuratedParamsField
              label="Params"
              params={compatibleParams}
              curatedParamNames={curatedParamNames}
              onToggleParam={(paramName, checked) =>
                setCuratedParamNames((names) =>
                  checked
                    ? names.includes(paramName)
                      ? names
                      : [...names, paramName]
                    : names.filter((name) => name !== paramName),
                )
              }
            />
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "choose" ? (
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer hover:bg-rose-200"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer hover:bg-rose-200"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer hover:bg-lime-200"
                onClick={handleSave}
                disabled={!file || isSaving}
              >
                Save
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
