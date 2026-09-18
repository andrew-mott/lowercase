import type {
  FlowDefinition,
  GetFlowsRes,
  GetFlowVersionRes,
  GetFlowVersionsRes,
  PostFlowFileRes,
  PostFlowReq,
  PostFlowRes,
  Result,
} from "@lcase/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { SERVER_URL } from "@/lib/server-url";

export const flowsApi = createApi({
  reducerPath: "flowsApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${SERVER_URL}/api/` }),
  endpoints: (builder) => ({
    getFlows: builder.query<GetFlowsRes, void>({
      query: () => "flows",
    }),
    getFlowDef: builder.query<Result<FlowDefinition, string>, string>({
      query: (flowId: string) => `/flows/${flowId}`,
    }),
    getFlowVersionDef: builder.query<GetFlowVersionRes, string>({
      query: (flowVersionId: string) => `/flows/versions/${flowVersionId}`,
    }),
    getFlowVersions: builder.query<GetFlowVersionsRes, string>({
      query: (flowId: string) => `/flows/${flowId}/versions`,
    }),
    addJsonFlow: builder.mutation<PostFlowRes, PostFlowReq>({
      query: (arg) => ({
        url: "flows",
        method: "POST",
        body: arg.body,
        headers: { "Content-Type": "application/json" },
      }),
    }),
    uploadFlowFile: builder.mutation<PostFlowFileRes, { files: File[] }>({
      query: ({ files }) => {
        const formData = new FormData();
        for (const file of files) formData.append("files", file);
        return {
          url: "flows/files",
          method: "POST",
          body: formData,
          // browser will set headers for us correctly
        };
      },
    }),
  }),
});

export const {
  useAddJsonFlowMutation,
  useUploadFlowFileMutation,
  useGetFlowsQuery,
  useGetFlowDefQuery,
  useGetFlowVersionDefQuery,
  useGetFlowVersionsQuery,
} = flowsApi;
