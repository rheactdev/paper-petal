import { createFileRoute } from "@tanstack/react-router";
import { CalendarStudio } from "../components/paper/calendar-studio";
import { getCalendarStatus } from "../calendar/functions";
import { calendarSearch } from "../calendar/model";
export const Route = createFileRoute("/calendar")({
  ssr: false,
  gcTime: 0,
  validateSearch: calendarSearch,
  loader: () => getCalendarStatus(),
  head: () => ({ meta: [{ title: "A little week · Paper & Petal" }] }),
  component: () => (
    <CalendarStudio
      initialStatus={Route.useLoaderData()}
      search={Route.useSearch()}
    />
  ),
});
