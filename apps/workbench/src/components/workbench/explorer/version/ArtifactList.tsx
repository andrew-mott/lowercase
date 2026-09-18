import { useState, type ReactNode } from "react";
import type { ArtifactListItem } from "@lcase/types";
import { PlusIcon } from "lucide-react";
import { useListArtifactsQuery } from "@/redux/api/artifacts-api";
import { cn } from "@/lib/utils";
import {
  ARTIFACT_AUTHORING_ICON_CLASS,
  ARTIFACT_ICON,
  ARTIFACT_ICON_CLASS,
} from "@/components/workbench/shared/tab-icons";
import { titleFor } from "@/components/workbench/shared/artifact-title";
import { CreateArtifactDialog } from "@/components/workbench/shared/CreateArtifactDialog";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";

// Scoped to one flow version's own curated artifacts -- no flow-wide
// "shared" artifacts included (no way to create more than one version of a
// flow yet, so that distinction has no real case to serve today). Every row
// is clickable, including bytes-format ones -- the related change kept those inert since
// there was nothing to view, but the related change metadata tab gives them something
// real to show even without a content preview.
export function ArtifactList({
  versionId,
  selectedRowId,
  onSelectArtifact,
}: {
  versionId: string;
  selectedRowId: string | null;
  onSelectArtifact: (item: ArtifactListItem, versionId: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading } = useListArtifactsQuery({
    flowVersionId: versionId,
    curated: "true",
  });

  const showLoading = useDelayedLoading(isLoading);

  let body: ReactNode;
  if (isLoading) {
    body = showLoading ? (
      <div className="pl-20 py-0.5 text-xs text-muted-foreground">
        Loading artifacts...
      </div>
    ) : null;
  } else if (!data?.ok) {
    body = (
      <div className="pl-20 py-0.5 text-xs text-destructive">
        Error loading artifacts
      </div>
    );
  } else {
    const artifacts = [...data.value].sort((a, b) =>
      titleFor(a).localeCompare(titleFor(b)),
    );
    body = artifacts.map((item) => {
      const isSelected = selectedRowId === `artifact:${item.artifact.hash}`;
      return (
        <div
          key={item.artifact.hash}
          onClick={() => onSelectArtifact(item, versionId)}
          className={cn(
            "flex items-center gap-2 pl-20 pr-2 py-0.5 text-xs cursor-pointer",
            isSelected ? "bg-explorer-selected" : "hover:bg-explorer-hover",
          )}
        >
          <ARTIFACT_ICON
            className={cn("size-3.5 shrink-0", ARTIFACT_ICON_CLASS)}
          />
          <span className="truncate">{titleFor(item)}</span>
        </div>
      );
    });
  }

  return (
    <>
      <div
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-2 pl-20 pr-2 py-0.5 text-xs cursor-pointer text-muted-foreground hover:bg-explorer-hover"
      >
        <PlusIcon
          className={cn("size-3.5 shrink-0", ARTIFACT_AUTHORING_ICON_CLASS)}
        />
        <span className="truncate">New artifact</span>
      </div>
      {body}

      <CreateArtifactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        versionId={versionId}
      />
    </>
  );
}
