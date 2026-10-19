import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { routes } from "@/config/routes.config";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  campusCode: z.string().min(2),
});

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { campusCode: "NORTHRIDGE" },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        await register(values);
        navigate(routes.citizen.home);
      })}
    >
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input id="name" className="mt-1" {...form.register("name")} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" className="mt-1" {...form.register("email")} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" className="mt-1" {...form.register("password")} />
      </div>
      <div>
        <Label htmlFor="campus">Campus code</Label>
        <Input id="campus" className="mt-1" {...form.register("campusCode")} />
      </div>
      <Button className="w-full" type="submit">
        Create citizen account
      </Button>
    </form>
  );
}
