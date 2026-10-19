import { get, set, del, keys } from "idb-keyval";
import type { ReportDraft } from "@/types/report";

const PREFIX = "sg.draft.";

export async function saveDraft(draft: ReportDraft) {
  await set(`${PREFIX}${draft.idempotencyKey}`, draft);
}

export async function deleteDraft(key: string) {
  await del(`${PREFIX}${key}`);
}

export async function listDrafts(): Promise<ReportDraft[]> {
  const all = await keys();
  const drafts: ReportDraft[] = [];
  for (const key of all) {
    if (typeof key === "string" && key.startsWith(PREFIX)) {
      const draft = await get<ReportDraft>(key);
      if (draft) drafts.push(draft);
    }
  }
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
