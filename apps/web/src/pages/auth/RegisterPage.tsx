import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { DisclaimerBanner } from "@/components/common/DisclaimerBanner";

export function RegisterPage() {
  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-slate-900">
      <DisclaimerBanner />
      <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-12">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm sm:p-9">
          <div className="mb-6 flex items-center justify-between">
            <img src="/logo.png" alt="ResQAI" className="h-9 w-auto object-contain" />
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
              Citizen Portal
            </span>
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">Create account</h1>
          <p className="mt-1.5 text-xs text-slate-500">
            Citizen registration. Responders must be authorized by campus admin.
          </p>
          <div className="mt-6">
            <RegisterForm />
          </div>
        </div>
      </div>
    </div>
  );
}
