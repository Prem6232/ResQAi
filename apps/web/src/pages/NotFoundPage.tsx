import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Page not found</h1>
        <Link className="mt-4 inline-block text-sos-600" to="/">
          Back to landing
        </Link>
      </div>
    </div>
  );
}
