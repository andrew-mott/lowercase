import {
  type GetSimsReq,
  type GetSimsRes,
  type PostSimsRes,
  type PostSimsReq,
  type GetSimSpecRes,
  type GetSimSpecReq,
} from "@lcase/types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { SERVER_URL } from "@/lib/server-url";

export const simsApi = createApi({
  reducerPath: "simsApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${SERVER_URL}/api/` }),
  tagTypes: ["Sim"],
  endpoints: (builder) => ({
    postSims: builder.mutation<PostSimsRes, PostSimsReq>({
      query: (arg) => ({
        url: "sims",
        method: "POST",
        body: arg,
        headers: { "Content-Type": "application/json" },
      }),
      invalidatesTags: ["Sim"],
    }),
    listAllSims: builder.query<GetSimsRes, GetSimsReq | void>({
      query: (args) => ({
        url: "sims",
        method: "GET",
        params: args?.flowVersionId
          ? { flowVersionId: args.flowVersionId }
          : undefined,
      }),
      providesTags: ["Sim"],
    }),
    getSim: builder.query<GetSimSpecRes, GetSimSpecReq>({
      query: (arg) => ({
        url: `sims/${arg.simId}`,
        method: "GET",
      }),
    }),
  }),
});

export const { useListAllSimsQuery, usePostSimsMutation, useGetSimQuery } =
  simsApi;
