import { LoginForm } from "@/components/login-form";
import { isDemo } from "@/lib/env";
export default function Login() {
  return <LoginForm demo={isDemo} />;
}
