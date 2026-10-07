import { z } from "zod";
import { weatherSnapshotSchema } from "../weather/model";

// The same strip is reserved in every flow column, preserving pagination.
export const HEADER_SPACE = 18;
export const headerSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }, "Choose a valid date."),
    weather: weatherSnapshotSchema.optional(),
  })
  .strict();
export type DocumentHeader = z.infer<typeof headerSchema>;
export function todayDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function headerDate(date: string, compact = false) {
  const value = new Date(`${headerSchema.shape.date.parse(date)}T00:00:00Z`);
  return {
    date: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: compact ? "short" : "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(value),
    day: new Intl.DateTimeFormat("en-GB", {
      weekday: compact ? "short" : "long",
      timeZone: "UTC",
    }).format(value),
  };
}
export function headerSpace(header?: DocumentHeader) {
  return header ? HEADER_SPACE : 0;
}
