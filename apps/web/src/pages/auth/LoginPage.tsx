import { LoginForm } from "@/features/auth/components/LoginForm";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { DisclaimerBanner } from "@/components/common/DisclaimerBanner";

export function LoginPage() {
  return (
    <div className="min-h-dvh bg-paper-100">
      <DisclaimerBanner />
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="font-display text-3xl font-extrabold">Sign in</h1>
        <p className="mt-2 text-sm text-ink-700/60">Authorized campus pilot participants only.</p>
        <div className="mt-8">
          <LoginForm />
        </div>
        <p className="mt-6 text-sm">
          New citizen?{" "}
          <Link className="text-sos-600" to={routes.register}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
