import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { useState } from "react";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "citizen@campus.demo", password: "demo1234" },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          const user = await login(values);
          const home =
            user.activeRole === "responder"
              ? routes.responder.feed
              : user.activeRole === "operator"
                ? routes.operator.live
                : user.activeRole === "admin"
                  ? routes.admin.home
                  : routes.citizen.home;
          navigate(home);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Login failed");
        }
      })}
    >
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" className="mt-1" {...form.register("email")} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" className="mt-1" {...form.register("password")} />
      </div>
      {error ? <p className="text-sm text-sos-600">{error}</p> : null}
      <Button variant="brand" className="w-full shadow-md shadow-blue-500/20" type="submit">
        Continue
      </Button>
    </form>
  );
}
