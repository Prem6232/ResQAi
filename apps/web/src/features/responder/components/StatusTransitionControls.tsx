import { Button } from "@/components/ui/button";

export function StatusTransitionControls({ onArrived }: { onArrived: () => void }) {
  return (
    <Button className="w-full" variant="dark" onClick={onArrived}>
      Arrived at scene
    </Button>
  );
}
