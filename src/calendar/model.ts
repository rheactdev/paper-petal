import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      Temporal.PlainDate.from(value);
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid date.");
export const timeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone.");
export const calendarSearch = z.object({
  week: dateOnly.optional().catch(undefined),
  connection: z
    .enum(["linked", "cancelled", "failed", "expired", "permissions"])
    .optional()
    .catch(undefined),
});
export const weekRequest = z.object({
  week: dateOnly,
  timeZone: timeZoneSchema,
  calendarIds: z
    .array(z.string().min(1).max(1024))
    .min(1)
    .max(10)
    .transform((ids) => [...new Set(ids)]),
});
export const eventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  calendarName: z.string(),
  title: z.string().max(2000),
  location: z.string().max(2000).default(""),
  allDay: z.boolean(),
  start: z.string(),
  end: z.string(),
});
export type CalendarEvent = z.infer<typeof eventSchema>;
export type CalendarChoice = {
  id: string;
  name: string;
  primary: boolean;
  timeZone: string;
};
export type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  signedIn: boolean;
  error?: string;
};
export type CalendarResult<T> =
  { ok: true; data: T } | { ok: false; message: string; reconnect?: boolean };
export type WeekRequest = z.infer<typeof weekRequest>;
