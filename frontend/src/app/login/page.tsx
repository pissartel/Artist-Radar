import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";
import AuthPage from "@/components/auth/AuthPage";

export default function LoginPage() {
  return <AuthPage title="Welcome back" description="Log in to return to your artist workspace."><Suspense><AuthForm mode="login" /></Suspense></AuthPage>;
}
