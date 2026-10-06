import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../components/paper/auth-form";
import { authSearch } from "../auth/model";
export const Route = createFileRoute("/sign-in")({
  ssr: true,
  validateSearch: (search) => authSearch.parse(search),
  head: () => ({ meta: [{ title: "Sign in · Paper & Petal" }] }),
  component: SignIn,
});
function SignIn() {
  return <AuthForm mode="sign-in" returnTo={Route.useSearch().returnTo} />;
}
