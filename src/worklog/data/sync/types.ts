import type {
  JiraConfigInput,
  JiraConfigView,
  JiraHttpRequest,
  JiraHttpResponse,
} from "../../../../shared/types";
import type { TaskPriority, TaskStatus } from "../../types";

/** 宿主桥：配置读写与 Jira REST 请求（token 只在宿主侧） */
export interface JiraTransport {
  getConfig(): Promise<JiraConfigView>;
  saveConfig(input: JiraConfigInput): Promise<JiraConfigView>;
  clearConfig(): Promise<void>;
  request(req: JiraHttpRequest): Promise<JiraHttpResponse>;
}

export interface JiraStatus {
  name?: string;
  statusCategory?: { key?: string; name?: string };
}

export interface JiraIssueFields {
  summary?: string;
  description?: unknown;
  status?: JiraStatus;
  priority?: { name?: string };
  issuetype?: { name?: string; subtask?: boolean };
  project?: { key?: string; name?: string };
  parent?: { key?: string; fields?: { summary?: string } };
  duedate?: string | null;
  timeoriginalestimate?: number | null;
  updated?: string;
}

export interface JiraIssue {
  id?: string;
  key: string;
  fields?: JiraIssueFields;
}

export interface JiraSearchResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  issues?: JiraIssue[];
  errorMessages?: string[];
  errors?: Record<string, string>;
}

/** 映射后的任务：只包含可写入本地 task 的字段 */
export interface MappedJiraIssue {
  externalSource: "jira";
  externalId: string;
  externalUrl: string;
  externalParentKey: string | null;
  externalParentSummary: string | null;
  externalStatus: string | null;
  externalUpdated: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimateDays: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  type: string;
  projectName: string;
}

export interface JiraSyncResult {
  ok: boolean;
  at: string;
  full: boolean;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  missing: number;
  warnings: string[];
  error?: string;
}

export interface JiraSyncStatus {
  lastSync: string | null;
  lastResult: JiraSyncResult | null;
}

export interface JiraTestResult {
  ok: boolean;
  message: string;
  user?: string;
}
