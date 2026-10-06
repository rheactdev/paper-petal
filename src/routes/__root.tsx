import type { ReactNode } from "react";
import {
  createRootRoute,
  HeadContent,
  Scripts,
  Outlet,
  Link,
} from "@tanstack/react-router";
import stylesheet from "../styles.css?url";
import { getSession } from "../auth/functions";
import { AuthProvider } from "../auth/provider";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/lora/600.css";
import "@fontsource/caveat/400.css";
export const Route = createRootRoute({
  loader: () => getSession(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Paper & Petal · Make room for lovely things" },
      {
        name: "description",
        content:
          "A thoughtful, keyboard-friendly stationery editor. Create journal pages and scrapbook spreads, then bring them to paper.",
      },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  shellComponent: Document,
  component: Root,
  notFoundComponent: () => (
    <div className="recovery">
      <h1>This page has wandered off.</h1>
      <Link to="/">Back to your documents</Link>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="recovery">
      <h1>We couldn’t open this page.</h1>
      <p>{error instanceof Error ? error.message : "Please try again."}</p>
      <button onClick={reset}>Try again</button>
      <Link to="/">Your documents</Link>
    </div>
  ),
});
function Root() {
  return (
    <AuthProvider initialSession={Route.useLoaderData()}>
      <Outlet />
    </AuthProvider>
  );
}
function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
