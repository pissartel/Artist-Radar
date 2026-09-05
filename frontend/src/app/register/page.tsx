import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";
import AuthPage from "@/components/auth/AuthPage";

export default function RegisterPage() {
  return <AuthPage title="Create your account" description="Two fields now. We find your artist next."><Suspense><AuthForm mode="register" /></Suspense></AuthPage>;
}
