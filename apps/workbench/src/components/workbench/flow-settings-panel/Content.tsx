import { useEffect } from "react";
import { toast } from "sonner";
import { useGetFlowsQuery } from "@/redux/api/flows-api";
import { IdentityField } from "@/components/workbench/shared/fields/IdentityField";
import { InputField } from "@/components/workbench/shared/fields/InputField";

export function Content({ flowId }: { flowId: string }) {
  const { data, error, isLoading, refetch } = useGetFlowsQuery();

  const hasError = error || data?.ok === false;
  useEffect(() => {
    if (hasError) {
      toast.error("Couldn't load flow settings", { duration: Infinity });
    }
  }, [hasError]);

  if (isLoading) return <div className="p-4">Loading flow settings...</div>;
  if (hasError)
    return (
      <div className="p-4 text-sm text-destructive">
        Couldn't load flow settings.{" "}
        <button className="underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  if (!data || !data.ok) return null;

  const flowItem = data.value.find((item) => item.flow.id === flowId);
  if (!flowItem)
    return (
      <div className="p-4 text-sm text-muted-foreground">Flow not found.</div>
    );

  const { flow } = flowItem;

  return (
    <div className="p-4 flex flex-col gap-3">
      <IdentityField label="Id" value={flow.id} />
      <IdentityField label="Kind" value={flow.kind} />
      <IdentityField label="Created" value={flow.createdAt} />
      <IdentityField label="Updated" value={flow.updatedAt} />
      <InputField label="Name" value={flow.name} />
      <InputField label="Description" value={flow.description} />
    </div>
  );
}
