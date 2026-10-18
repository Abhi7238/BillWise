import { isAuthConfigured } from "@/lib/auth";
import { headers } from "next/headers";
import LoginForm from "./login-form";

export const metadata = {
  title: "Sign in · Billwise",
};

export default async function LoginPage() {
  await headers();
  return <LoginForm authConfigured={isAuthConfigured()} />;
}
