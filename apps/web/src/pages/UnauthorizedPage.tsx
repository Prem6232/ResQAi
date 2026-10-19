import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-bold">You do not have access</h1>
        <p className="mt-2 text-sm text-ink-700/70">This area is limited to an approved role.</p>
        <Link className="mt-4 inline-block text-sos-600" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
