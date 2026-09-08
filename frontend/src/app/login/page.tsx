import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";
import AuthPage from "@/components/auth/AuthPage";

export default function LoginPage() {
  return <AuthPage title="Welcome back" description="Your artist, your opportunities, where you left them."><Suspense><AuthForm mode="login" /></Suspense></AuthPage>;
}
