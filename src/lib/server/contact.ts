import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";

const { contactRequests } = schema;

/** The «كلمنا» form on the platform's home page (components/landing): who's asking about the service. */
export const CONTACT_ROLES = { teacher: "مدرس", center: "سنتر", agency: "وكالة تسويق", other: "غير ذلك" } as const;
export type ContactRole = keyof typeof CONTACT_ROLES;
export const CONTACT_STATUSES = { new: "جديد", contacted: "اتكلمنا", done: "خلص" } as const;
export type ContactStatus = keyof typeof CONTACT_STATUSES;

export type ContactRequest = { id: string; createdAt: string; name: string; phone: string; role: ContactRole; subject: string | null; message: string | null; status: ContactStatus };

const PER_HOUR = 4;

export async function addContact(r: { name: string; phone: string; role: ContactRole; subject: string; message: string; visitor: string }): Promise<"ok" | "limit"> {
  const since = new Date(Date.now() - 3600_000);
  const [n] = await db().select({ n: sql<number>`count(*)::int` }).from(contactRequests).where(and(eq(contactRequests.visitor, r.visitor), gte(contactRequests.createdAt, since)));
  if ((n?.n ?? 0) >= PER_HOUR) return "limit";
  await db().insert(contactRequests).values({ name: r.name, phone: r.phone, role: r.role, subject: r.subject || null, message: r.message || null, visitor: r.visitor });
  return "ok";
}

export async function listContacts(): Promise<ContactRequest[]> {
  if (!hasDb()) return [];
  const rows = await db().select().from(contactRequests).orderBy(desc(contactRequests.createdAt)).limit(500);
  return rows.map((r) => ({
    id: r.id, createdAt: r.createdAt.toISOString(), name: r.name, phone: r.phone, subject: r.subject, message: r.message,
    role: (r.role in CONTACT_ROLES ? r.role : "other") as ContactRole, status: (r.status in CONTACT_STATUSES ? r.status : "new") as ContactStatus,
  }));
}

export async function newContactsCount(): Promise<number> {
  if (!hasDb()) return 0;
  const [n] = await db().select({ n: sql<number>`count(*)::int` }).from(contactRequests).where(eq(contactRequests.status, "new"));
  return n?.n ?? 0;
}

export async function setContactStatus(id: string, status: ContactStatus): Promise<void> {
  await db().update(contactRequests).set({ status }).where(eq(contactRequests.id, id));
}

export async function deleteContact(id: string): Promise<void> {
  await db().delete(contactRequests).where(eq(contactRequests.id, id));
}
