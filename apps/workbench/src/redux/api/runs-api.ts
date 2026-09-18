import type {
  GetRunDetailReq,
  GetRunDetailRes,
  GetRunEventsReq,
  GetRunEventsRes,
  GetRunParamsReq,
  GetRunParamsRes,
  GetRunsReq,
  GetRunsRes,
  PostRunsReq,
  PostRunsRes,
} from "@lcase/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { eventsBatch } from "../middleware/sse";
import { SERVER_URL } from "@/lib/server-url";

export const runsApi = createApi({
  reducerPath: "runsApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${SERVER_URL}/api/` }),
  tagTypes: ["Runs"],
  endpoints: (builder) => ({
    requestRun: builder.mutation<PostRunsRes, PostRunsReq>({
      query: (arg) => ({
        url: "runs",
        method: "POST",
        body: arg,
        headers: { "Content-Type": "application/json" },
      }),
      // only a real runId (not an error response) should invalidate the
      // list -- an ok:false result never created anything worth refetching
      // for
      invalidatesTags: (result) => (result?.ok ? ["Runs"] : []),
    }),
    listAllRuns: builder.query<GetRunsRes, GetRunsReq | void>({
      query: (args) => ({
        url: "runs",
        method: "GET",
        params: args?.flowVersionId
          ? { flowVersionId: args.flowVersionId }
          : undefined,
      }),
      providesTags: ["Runs"],
    }),

    getRunDetail: builder.query<GetRunDetailRes, GetRunDetailReq>({
      query: (arg) => ({
        url: `runs/${arg.runId}`,
        method: "GET",
      }),
    }),
    getRunParams: builder.query<GetRunParamsRes, GetRunParamsReq>({
      query: (arg) => ({
        url: `runs/${arg.runId}/params`,
        method: "GET",
      }),
    }),
    getAllRunEvents: builder.query<GetRunEventsRes, GetRunEventsReq>({
      query: (args: GetRunEventsReq) => ({
        url: `runs/details?runId=${args.runId}`,
        method: "GET",
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.ok) {
            dispatch(eventsBatch({ events: data.events }));
          }
        } catch (e) {
          console.error(e);
        }
      },
    }),
  }),
});

export const {
  useRequestRunMutation,
  useListAllRunsQuery,
  useGetAllRunEventsQuery,
  useGetRunDetailQuery,
  useGetRunParamsQuery,
} = runsApi;
