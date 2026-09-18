-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ArtifactFormat" AS ENUM ('json', 'text', 'markdown', 'bytes');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('requested', 'started', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "FlowKind" AS ENUM ('business', 'eval');

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "FlowKind" NOT NULL DEFAULT 'business',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowVersion" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "versionLabel" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "hash" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT,
    "filename" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "format" "ArtifactFormat",
    "flowId" TEXT,
    "flowVersionId" TEXT,
    "curated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "ArtifactParamCuration" (
    "artifactHash" TEXT NOT NULL,
    "flowVersionId" TEXT NOT NULL,
    "paramName" TEXT NOT NULL,

    CONSTRAINT "ArtifactParamCuration_pkey" PRIMARY KEY ("artifactHash","flowVersionId","paramName")
);

-- CreateTable
CREATE TABLE "Sim" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flowId" TEXT NOT NULL,
    "flowVersionId" TEXT NOT NULL,
    "forkSpecHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "flowId" TEXT,
    "flowVersionId" TEXT,
    "flowDefHash" TEXT NOT NULL,
    "simId" TEXT,
    "parentRunId" TEXT,
    "forkSpecHash" TEXT,
    "experimentId" TEXT,
    "targetRunId" TEXT,
    "targetStepId" TEXT,
    "targetExportName" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "duration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalResult" (
    "id" TEXT NOT NULL,
    "targetRunId" TEXT NOT NULL,
    "targetStepId" TEXT,
    "targetExportName" TEXT,
    "evalRunId" TEXT NOT NULL,
    "evalFlowId" TEXT,
    "evalFlowVersionId" TEXT,
    "experimentId" TEXT,
    "overall" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunParam" (
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,

    CONSTRAINT "RunParam_pkey" PRIMARY KEY ("runId","name")
);

-- CreateTable
CREATE TABLE "RunStepProjection" (
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "duration" DOUBLE PRECISION,
    "reusedTime" TIMESTAMP(3),
    "wasReused" BOOLEAN,
    "outputHash" TEXT,

    CONSTRAINT "RunStepProjection_pkey" PRIMARY KEY ("runId","stepId")
);

-- CreateTable
CREATE TABLE "RunStepExport" (
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,

    CONSTRAINT "RunStepExport_pkey" PRIMARY KEY ("runId","stepId","name")
);

-- CreateIndex
CREATE INDEX "FlowVersion_flowId_idx" ON "FlowVersion"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowVersion_flowId_sequence_key" ON "FlowVersion"("flowId", "sequence");

-- CreateIndex
CREATE INDEX "Artifact_time_idx" ON "Artifact"("time");

-- CreateIndex
CREATE INDEX "Artifact_flowId_idx" ON "Artifact"("flowId");

-- CreateIndex
CREATE INDEX "Artifact_flowVersionId_idx" ON "Artifact"("flowVersionId");

-- CreateIndex
CREATE INDEX "ArtifactParamCuration_artifactHash_idx" ON "ArtifactParamCuration"("artifactHash");

-- CreateIndex
CREATE INDEX "ArtifactParamCuration_flowVersionId_idx" ON "ArtifactParamCuration"("flowVersionId");

-- CreateIndex
CREATE INDEX "Sim_createdAt_idx" ON "Sim"("createdAt");

-- CreateIndex
CREATE INDEX "Sim_flowId_idx" ON "Sim"("flowId");

-- CreateIndex
CREATE INDEX "Sim_flowVersionId_idx" ON "Sim"("flowVersionId");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "Run_flowId_idx" ON "Run"("flowId");

-- CreateIndex
CREATE INDEX "Run_flowVersionId_idx" ON "Run"("flowVersionId");

-- CreateIndex
CREATE INDEX "Run_simId_idx" ON "Run"("simId");

-- CreateIndex
CREATE INDEX "Run_parentRunId_idx" ON "Run"("parentRunId");

-- CreateIndex
CREATE INDEX "Run_experimentId_idx" ON "Run"("experimentId");

-- CreateIndex
CREATE INDEX "EvalResult_targetRunId_idx" ON "EvalResult"("targetRunId");

-- CreateIndex
CREATE INDEX "EvalResult_evalRunId_idx" ON "EvalResult"("evalRunId");

-- CreateIndex
CREATE INDEX "EvalResult_experimentId_idx" ON "EvalResult"("experimentId");

-- CreateIndex
CREATE INDEX "EvalResult_createdAt_idx" ON "EvalResult"("createdAt");

-- CreateIndex
CREATE INDEX "RunParam_artifactHash_idx" ON "RunParam"("artifactHash");

-- CreateIndex
CREATE INDEX "RunStepProjection_runId_idx" ON "RunStepProjection"("runId");

-- CreateIndex
CREATE INDEX "RunStepProjection_status_idx" ON "RunStepProjection"("status");

-- CreateIndex
CREATE INDEX "RunStepExport_artifactHash_idx" ON "RunStepExport"("artifactHash");

-- AddForeignKey
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactParamCuration" ADD CONSTRAINT "ArtifactParamCuration_artifactHash_fkey" FOREIGN KEY ("artifactHash") REFERENCES "Artifact"("hash") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactParamCuration" ADD CONSTRAINT "ArtifactParamCuration_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sim" ADD CONSTRAINT "Sim_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sim" ADD CONSTRAINT "Sim_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_simId_fkey" FOREIGN KEY ("simId") REFERENCES "Sim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_targetRunId_fkey" FOREIGN KEY ("targetRunId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunParam" ADD CONSTRAINT "RunParam_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStepProjection" ADD CONSTRAINT "RunStepProjection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStepExport" ADD CONSTRAINT "RunStepExport_runId_stepId_fkey" FOREIGN KEY ("runId", "stepId") REFERENCES "RunStepProjection"("runId", "stepId") ON DELETE CASCADE ON UPDATE CASCADE;
