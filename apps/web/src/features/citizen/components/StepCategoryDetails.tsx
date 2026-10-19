import { categoryMeta } from "@/lib/categories";
import type { IncidentCategory } from "@/types/incident";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function StepCategoryDetails({
  category,
  text,
  onCategory,
  onText,
}: {
  category: IncidentCategory;
  text: string;
  onCategory: (c: IncidentCategory) => void;
  onText: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(categoryMeta) as IncidentCategory[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onCategory(key)}
            className={cn(
              "rounded-2xl border bg-white px-3 py-3 text-left text-sm font-medium",
              category === key ? "border-sos-500 ring-2 ring-sos-100" : "border-black/5",
            )}
          >
            {categoryMeta[key].icon} {categoryMeta[key].label}
          </button>
        ))}
      </div>
      <Textarea
        placeholder="What is happening? Optional but helpful."
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
    </div>
  );
}
