import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import type { OnMount } from "@monaco-editor/react";
import { useGetFlowVersionDefQuery } from "@/redux/api/flows-api";
import { CodeEditor } from "@/components/workbench/shared/CodeEditor";

export function Content({
  versionId,
  revealPath,
  revealAt,
}: {
  versionId: string;
  revealPath?: string[];
  revealAt?: number;
}) {
  const { data, error, isLoading, refetch } =
    useGetFlowVersionDefQuery(versionId);

  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null);
  const lastRevealedAt = useRef<number | undefined>(undefined);

  const hasError = error || data?.ok === false;
  useEffect(() => {
    if (hasError) {
      toast.error("Couldn't load the flow definition", {
        duration: Infinity,
      });
    }
  }, [hasError]);

  const jsonText = data?.ok
    ? JSON.stringify(data.value.definition, null, 2)
    : null;

  // revealAt is a one-shot navigate command, not part of this panel's
  // identity -- a fresh Date.now() per click guarantees it's never
  // shallowEqual-identical to the last request (see explorer-panels.ts),
  // so this effect fires on every click, even repeated ones to the same
  // path. Depends on `editor` itself (state, not a ref) so it also fires
  // the moment the editor mounts, covering a panel opened fresh with
  // revealPath/revealAt already set before Monaco is ready.
  useEffect(() => {
    if (
      !editor ||
      !jsonText ||
      revealAt === undefined ||
      revealAt === lastRevealedAt.current
    ) {
      return;
    }
    lastRevealedAt.current = revealAt;
    if (!revealPath) return;
    const tree = parseTree(jsonText);
    const node = tree && findNodeAtLocation(tree, revealPath);
    if (!node) return;
    const model = editor.getModel();
    if (!model) return;
    const start = model.getPositionAt(node.offset);
    const end = model.getPositionAt(node.offset + node.length);
    const range = {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    };
    editor.revealRangeInCenter(range);
    editor.setSelection(range);
  }, [editor, revealPath, revealAt, jsonText]);

  if (isLoading) return <div className="p-4">Loading JSON definition...</div>;
  if (hasError)
    return (
      <div className="p-4 text-sm text-destructive">
        Couldn't load the flow definition.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  if (!data || !data.ok || jsonText === null) return null;

  return (
    <CodeEditor
      language="json"
      value={jsonText}
      height="100%"
      readOnly
      onMount={setEditor}
    />
  );
}
