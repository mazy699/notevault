import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type EntryCreateInput, type EntryUpdatePatch } from "../api/client";
import type {
  CreateTaskInput,
  NoteInput,
  Task,
  TaskListFilter,

  TodoConvertInput,
  TodoAttachInput,
  TodoUpdateInput,
} from "../types";

export const qk = {
  week: (date: string) => ["week", date] as const,
  month: (date: string) => ["month", date] as const,
  day: (date: string) => ["day", date] as const,
  dayDetail: (date: string) => ["dayDetail", date] as const,
  morning: (date: string) => ["morning", date] as const,
  tasks: (filter: TaskListFilter) => ["tasks", filter] as const,
  task: (id: number) => ["task", id] as const,
  holidays: ["holidays"] as const,
  info: ["info"] as const,
  projects: ["projects"] as const,
  taskTypes: ["taskTypes"] as const,
  todos: ["todos"] as const,
  onboarding: ["onboarding"] as const,
  jiraConfig: ["jiraConfig"] as const,
  jiraStatus: ["jiraStatus"] as const,
};

/** 本地单机库查询成本低，任何写操作后统一失效全部查询，保证视图一致 */
export function useInvalidateAll(): () => Promise<void> {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useWeekMatrix(date: string) {
  return useQuery({ queryKey: qk.week(date), queryFn: () => api.weekMatrix(date) });
}

export function useMonthOverview(date: string) {
  return useQuery({ queryKey: qk.month(date), queryFn: () => api.monthOverview(date) });
}

export function useDayDetail(date: string) {
  return useQuery({ queryKey: qk.dayDetail(date), queryFn: () => api.dayDetail(date) });
}

export function useDayLog(date: string) {
  return useQuery({ queryKey: qk.day(date), queryFn: () => api.dayLog(date) });
}

export function useMorningData(today: string) {
  return useQuery({ queryKey: qk.morning(today), queryFn: () => api.morningData(today) });
}

export function useTaskList(filter: TaskListFilter) {
  return useQuery({ queryKey: qk.tasks(filter), queryFn: () => api.taskList(filter) });
}

export function useTaskDetail(id: number | null) {
  return useQuery({
    queryKey: qk.task(id ?? 0),
    queryFn: () => api.taskGet(id as number),
    enabled: id != null,
  });
}

export function useHolidayStatus() {
  return useQuery({ queryKey: qk.holidays, queryFn: () => api.holidayStatus() });
}

export function useDataInfo() {
  return useQuery({ queryKey: qk.info, queryFn: () => api.dataInfo() });
}

function useWrite<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}

export function useTaskCreate() {
  return useWrite((input: CreateTaskInput) => api.taskCreate(input));
}

export function useTaskUpdate() {
  return useWrite((task: Task) => api.taskUpdate(task));
}

export function useTaskSetStatus() {
  return useWrite((v: { taskId: number; status: string }) => api.taskSetStatus(v.taskId, v.status));
}

export function useTaskDelete() {
  return useWrite((v: { taskId: number; hard: boolean }) => api.taskDelete(v.taskId, v.hard));
}

export function useEntryCreate() {
  return useWrite((input: EntryCreateInput) => api.entryCreate(input));
}

export function useEntryUpdate() {
  return useWrite((v: { entryId: number; patch: EntryUpdatePatch }) => api.entryUpdate(v.entryId, v.patch));
}

export function useEntryDelete() {
  return useWrite((entryId: number) => api.entryDelete(entryId));
}

export function useNoteUpsert() {
  return useWrite((v: { date: string; planText: string }) => api.noteUpsert(v.date, v.planText));
}

export function useHolidayImport() {
  return useWrite((text: string) => api.holidayImport(text));
}

export function useImportJson() {
  return useWrite((text: string) => api.importJson(text));
}

export function useDemoSeed() {
  return useWrite(() => api.demoSeed());
}

export function useDemoClear() {
  return useWrite(() => api.demoClear());
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => api.projectList() });
}

export function useTaskTypes() {
  return useQuery({ queryKey: qk.taskTypes, queryFn: () => api.taskTypesList() });
}

export function useTaskTypeCreate() {
  return useWrite((input: { label: string; color: string }) => api.taskTypeCreate(input));
}

export function useTaskTypeUpdate() {
  return useWrite((v: { id: string; label: string; color: string }) =>
    api.taskTypeUpdate(v.id, { label: v.label, color: v.color })
  );
}

export function useTaskTypeDelete() {
  return useWrite((id: string) => api.taskTypeDelete(id));
}

export function useOnboardingStatus() {
  return useQuery({ queryKey: qk.onboarding, queryFn: () => api.onboardingStatus() });
}

export function useProjectCreate() {
  return useWrite((name: string) => api.projectCreate(name));
}

export function useProjectRename() {
  return useWrite((v: { id: number; name: string }) => api.projectRename(v.id, v.name));
}

export function useProjectDelete() {
  return useWrite((id: number) => api.projectDelete(id));
}

export function useNotes(filter: { search?: string | null; tag?: string | null }) {
  return useQuery({ queryKey: ["notes", filter] as const, queryFn: () => api.noteList(filter) });
}

export function useNoteCreate() {
  return useWrite((input: NoteInput) => api.noteCreate(input));
}

export function useNoteUpdate() {
  return useWrite((v: { id: number; input: NoteInput }) => api.noteUpdate(v.id, v.input));
}

export function useNoteDelete() {
  return useWrite((id: number) => api.noteDelete(id));
}

export function useNoteTogglePin() {
  return useWrite((id: number) => api.noteTogglePin(id));
}

export function useTodos() {
  return useQuery({ queryKey: qk.todos, queryFn: () => api.todoList() });
}

export function useTodoCreate() {
  return useWrite((content: string) => api.todoCreate(content));
}

export function useTodoUpdate() {
  return useWrite((v: { id: number; input: TodoUpdateInput }) => api.todoUpdate(v.id, v.input));
}

export function useTodoToggle() {
  return useWrite((id: number) => api.todoToggle(id));
}

export function useTodoDelete() {
  return useWrite((id: number) => api.todoDelete(id));
}

export function useTodoDeleteMany() {
  return useWrite((ids: number[]) => api.todoDeleteMany(ids));
}

export function useTodoConvert() {
  return useWrite((input: TodoConvertInput) => api.todoConvert(input));
}

export function useTodoAttach() {
  return useWrite((input: TodoAttachInput) => api.todoAttach(input));
}

// ---------------- Jira 同步 ----------------

export function useJiraConfig() {
  return useQuery({ queryKey: qk.jiraConfig, queryFn: () => api.jiraGetConfig() });
}

export function useJiraStatus() {
  return useQuery({ queryKey: qk.jiraStatus, queryFn: () => api.jiraStatus() });
}

/** 立即同步成功后统一失效全部查询（任务/周视图/月视图/状态一起刷新） */
export function useJiraSyncNow() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: () => api.jiraSyncNow(), onSuccess: () => invalidate() });
}
