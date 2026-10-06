import { createServerFn } from "@tanstack/react-start";
import { weekRequest } from "./model";
export const getCalendarStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { calendarStatus } = await import("./google.server");
    return calendarStatus();
  },
);
export const connectGoogleCalendar = createServerFn({ method: "POST" }).handler(
  async () => {
    const { beginCalendarLink } = await import("./google.server");
    return beginCalendarLink();
  },
);
export const getGoogleCalendars = createServerFn({ method: "GET" }).handler(
  async () => {
    const { listGoogleCalendars } = await import("./google.server");
    return listGoogleCalendars();
  },
);
export const getGoogleWeek = createServerFn({ method: "POST" })
  .validator(weekRequest)
  .handler(async ({ data }) => {
    const { fetchGoogleWeek } = await import("./google.server");
    return fetchGoogleWeek(data);
  });
export const disconnectGoogleCalendar = createServerFn({
  method: "POST",
}).handler(async () => {
  const { unlinkGoogleCalendar } = await import("./google.server");
  return unlinkGoogleCalendar();
});
