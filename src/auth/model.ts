import { z } from "zod";
export function validAuthReturnTo(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return false;
  const url = new URL(value, "https://paper.invalid");
  return (
    url.origin === "https://paper.invalid" &&
    (url.pathname === "/" ||
      url.pathname === "/calendar" ||
      /^\/documents\/[a-zA-Z0-9_-]+$/.test(url.pathname))
  );
}
export const authSearch = z.object({
  returnTo: z
    .string()
    .max(2048)
    .refine(validAuthReturnTo)
    .optional()
    .catch(undefined),
});
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);
const password = z
  .string()
  .min(1, "Enter your password.")
  .max(71, "Use at most 71 characters.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 71,
    "Your password is too long. Use fewer characters, especially emoji or accented letters.",
  );
export const signInSchema = z.object({ email, password });
export const signUpSchema = signInSchema
  .extend({
    name: z.string().trim().max(80, "Use at most 80 characters."),
    password: password.min(8, "Use at least 8 characters for your password."),
    passwordConfirm: password,
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Your passwords don’t match.",
    path: ["passwordConfirm"],
  });
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type AuthUser = { id: string; email: string; name: string };
export type AuthSession = { user: AuthUser | null; unavailable: boolean };
export type AuthResult =
  { ok: true; user: AuthUser } | { ok: false; message: string };
