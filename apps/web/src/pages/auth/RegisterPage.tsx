import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { DisclaimerBanner } from "@/components/common/DisclaimerBanner";

export function RegisterPage() {
  return (
    <div className="min-h-dvh bg-paper-100">
      <DisclaimerBanner />
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="font-display text-3xl font-extrabold">Create account</h1>
        <p className="mt-2 text-sm text-ink-700/60">Citizen registration. Responders must be approved by an administrator.</p>
        <div className="mt-8">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
