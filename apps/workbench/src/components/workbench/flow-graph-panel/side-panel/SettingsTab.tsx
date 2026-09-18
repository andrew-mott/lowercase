import type { FlowVersionRecord } from "@lcase/types";
import { IdentityField } from "@/components/workbench/shared/fields/IdentityField";
import { InputField } from "@/components/workbench/shared/fields/InputField";

export function SettingsTab({
  version,
  start,
}: {
  version: FlowVersionRecord;
  start: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <IdentityField label="Id" value={version.id} />
      <IdentityField label="Sequence" value={String(version.sequence)} />
      <IdentityField label="Hash" value={version.definitionHash} />
      <IdentityField label="Created" value={version.createdAt} />
      <InputField label="Label" value={version.versionLabel} />
      <InputField label="Description" value={version.description} />
      <InputField label="Start Step" value={start} />
    </div>
  );
}
