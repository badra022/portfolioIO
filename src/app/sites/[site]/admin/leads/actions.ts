"use server";

import { refresh } from "next/cache";
import { requireSuper } from "@/lib/server/auth";
import { CONTACT_STATUSES, deleteContact, setContactStatus, type ContactStatus } from "@/lib/server/contact";

/* Messages from the home page's «كلمنا» form: super admin only, on the platform host. */
const PLATFORM = "_platform";

export async function setLeadStatusAction(id: string, status: ContactStatus): Promise<void> {
  await requireSuper(PLATFORM);
  if (!(status in CONTACT_STATUSES)) return;
  await setContactStatus(id, status);
  refresh();
}

export async function deleteLeadAction(id: string): Promise<void> {
  await requireSuper(PLATFORM);
  await deleteContact(id);
  refresh();
}
