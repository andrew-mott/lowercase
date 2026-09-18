import type {
  ArtifactUpdateMetadata,
  GetArtifactReq,
  GetArtifactRes,
  GetArtifactsReq,
  GetArtifactsRes,
  PatchArtifactReq,
  PatchArtifactRes,
  PostArtifactRes,
} from "@lcase/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { SERVER_URL } from "@/lib/server-url";

// client-side calling convention, not a wire type -- the route branches on
// Content-Type, so this just picks which encoding `query` produces. value
// is always a raw string, even for contentType: application/json -- the
// server decides whether to JSON.parse it, matching the multipart branch's
// own contract (raw text in, format-based parsing happens server-side)
type CreateArtifactArg =
  | {
      kind: "authored";
      contentType: string;
      value: string;
      metadata?: ArtifactUpdateMetadata;
    }
  | { kind: "file"; file: File; metadata?: ArtifactUpdateMetadata };

export const artifactsApi = createApi({
  reducerPath: "artifactsApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${SERVER_URL}/api/` }),
  tagTypes: ["Artifacts"],
  endpoints: (builder) => ({
    listArtifacts: builder.query<GetArtifactsRes, GetArtifactsReq | void>({
      query: (args) => ({
        url: "artifacts",
        method: "GET",
        params: args
          ? {
              ...(args.flowId ? { flowId: args.flowId } : {}),
              ...(args.flowVersionId
                ? { flowVersionId: args.flowVersionId }
                : {}),
              ...(args.curated ? { curated: args.curated } : {}),
              ...(args.hash ? { hash: args.hash } : {}),
            }
          : undefined,
      }),
      providesTags: ["Artifacts"],
    }),
    getArtifact: builder.query<GetArtifactRes, GetArtifactReq>({
      query: (args) => ({
        url: `artifacts/${args.hash}`,
        method: "GET",
      }),
    }),
    createArtifact: builder.mutation<PostArtifactRes, CreateArtifactArg>({
      query: (arg) => {
        if (arg.kind === "authored") {
          return {
            url: "artifacts",
            method: "POST",
            body: {
              contentType: arg.contentType,
              value: arg.value,
              metadata: arg.metadata,
            },
          };
        }
        const formData = new FormData();
        formData.append("file", arg.file);
        if (arg.metadata)
          formData.append("metadata", JSON.stringify(arg.metadata));
        return {
          url: "artifacts",
          method: "POST",
          body: formData,
        };
      },
      invalidatesTags: ["Artifacts"],
    }),
    updateArtifactMetadata: builder.mutation<
      PatchArtifactRes,
      { hash: string; metadata: PatchArtifactReq }
    >({
      query: ({ hash, metadata }) => ({
        url: `artifacts/${hash}`,
        method: "PATCH",
        body: metadata,
      }),
      invalidatesTags: ["Artifacts"],
    }),
  }),
});

export const {
  useListArtifactsQuery,
  useGetArtifactQuery,
  useLazyGetArtifactQuery,
  useCreateArtifactMutation,
  useUpdateArtifactMetadataMutation,
} = artifactsApi;
