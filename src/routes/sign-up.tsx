import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../components/paper/auth-form";
import { authSearch } from "../auth/model";
export const Route = createFileRoute("/sign-up")({
  ssr: true,
  validateSearch: (search) => authSearch.parse(search),
  head: () => ({ meta: [{ title: "Create an account · Paper & Petal" }] }),
  component: SignUp,
});
function SignUp() {
  return <AuthForm mode="sign-up" returnTo={Route.useSearch().returnTo} />;
}
