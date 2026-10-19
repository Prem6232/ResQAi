import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { cn } from "@/lib/utils";

export function SOSQuickButton() {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const nav = useNavigate();
  const started = useRef<number>();

  useEffect(() => {
    if (!holding) {
      setProgress(0);
      return;
    }
    started.current = Date.now();
    const id = window.setInterval(() => {
      const p = Math.min(100, ((Date.now() - (started.current ?? 0)) / 3000) * 100);
      setProgress(p);
      if (p >= 100) {
        setHolding(false);
        nav(routes.citizen.sos);
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [holding, nav]);

  return (
    <div className="relative mx-auto grid h-56 w-56 place-items-center">
      <div className="absolute inset-0 rounded-full bg-sos-50" />
      <div
        className="absolute inset-3 rounded-full border-[10px] border-sos-100"
        style={{
          background: `conic-gradient(#E23B3B ${progress * 3.6}deg, transparent 0)`,
          mask: "radial-gradient(farthest-side, transparent calc(100% - 10px), #000 0)",
        }}
      />
      <button
        type="button"
        aria-label="Hold for three seconds to open SOS confirmation"
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        className={cn(
          "relative z-10 grid h-36 w-36 place-items-center rounded-full bg-sos-500 text-white shadow-sos",
          holding && "scale-95",
        )}
      >
        <span className="font-display text-2xl font-extrabold tracking-wide">SOS</span>
      </button>
      <p className="absolute -bottom-1 text-xs font-medium text-sos-600">HOLD FOR 3 sec</p>
    </div>
  );
}
