import { useEffect } from "react";
import { useGetArtifactQuery } from "@/redux/api/artifacts-api";
import type { ParamArtifactContent } from "@/components/workbench/shared/ref-resolution";

type Props = {
  hash: string;
  onLoaded: (hash: string, artifact: ParamArtifactContent) => void;
};

/**
 * Renders nothing — fetches one artifact by hash and reports it up once loaded.
 * Rendered once per distinct hash needed by a step's refs, so RTK Query's own
 * cache dedup means N refs sharing a hash only ever trigger one request.
 */
export function ArtifactHashLoader({ hash, onLoaded }: Props) {
  const { data } = useGetArtifactQuery({ hash });

  useEffect(() => {
    if (data?.ok && data.format !== "bytes") {
      onLoaded(hash, {
        format: data.format,
        value: data.value,
      } as ParamArtifactContent);
    }
  }, [data, hash, onLoaded]);

  return null;
}
