import { createServerFn } from "@tanstack/react-start";
import { signInSchema, signUpSchema } from "./model";
export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const { readSession } = await import("./pocketbase.server");
    return readSession();
  },
);
export const signIn = createServerFn({ method: "POST" })
  .validator(signInSchema)
  .handler(async ({ data }) => {
    const { authenticate } = await import("./pocketbase.server");
    return authenticate(data);
  });
export const signUp = createServerFn({ method: "POST" })
  .validator(signUpSchema)
  .handler(async ({ data }) => {
    const { register } = await import("./pocketbase.server");
    return register(data);
  });
export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSession } = await import("./pocketbase.server");
  return clearSession();
});
