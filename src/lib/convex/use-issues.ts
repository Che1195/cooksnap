"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { IssueReport, IssueReportSeverity, IssueReportStatus } from "@/types";

export function useIssues(): IssueReport[] | undefined {
  return useQuery(api.issueReports.list, {});
}

/** Whether the signed-in user may change issue status. */
export function useIsIssueMember(): boolean | undefined {
  return useQuery(api.users.isIssueMember, {});
}

export interface NewIssue {
  title: string;
  description: string;
  steps?: string;
  expected?: string;
  actual?: string;
  pageUrl?: string;
  severity: IssueReportSeverity;
}

export function useIssueActions() {
  const create = useMutation(api.issueReports.create);
  const setStatus = useMutation(api.issueReports.setStatus);
  return {
    createIssue: async (input: NewIssue): Promise<void> => {
      await create(input);
    },
    setIssueStatus: async (id: string, status: IssueReportStatus): Promise<void> => {
      await setStatus({ id: id as Id<"issueReports">, status });
    },
  };
}
