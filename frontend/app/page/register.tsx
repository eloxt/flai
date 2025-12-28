import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth-store";
import { api, ApiError } from "../lib/api";
import type { AuthUser, TokenPair } from "../lib/auth-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Field, FieldGroup, FieldSeparator } from "@/components/ui/field";
import { TentTree } from "lucide-react";

interface RegisterPayload {
    email: string;
    username: string;
    password: string;
}

export default function Register({
    className,
    ...props
}: React.ComponentProps<"div">) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);
    const isAuthenticated = useAuthStore((state) => !!state.user);
    const [form, setForm] = useState<RegisterPayload>({
        email: "",
        username: "",
        password: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (key: keyof RegisterPayload) => (value: string) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            const data = await api.post<{ user: AuthUser; token: TokenPair }>("/auth/register", form, { auth: false });

            if (data.user.is_active !== 1) {
                navigate("/activation-pending", { replace: true });
                return;
            }

            login(data);

            toast.success(t("pages.register.success"));
            navigate("/", { replace: true });
        } catch (error) {
            console.error(error);
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("common.error.network"));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            navigate("/", { replace: true });
        }
    }, [navigate]);

    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <form className="p-6 md:p-8" onSubmit={handleSubmit}>
                <FieldGroup>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex size-8 items-center justify-center rounded-md">
                            <TentTree className="size-6" />
                        </div>
                        <h1 className="text-xl font-bold">{t("pages.register.title")}</h1>
                    </div>
                    <Field>
                        <Label htmlFor="username">{t("pages.register.username")}</Label>
                        <Input
                            id="username"
                            type="text"
                            minLength={3}
                            maxLength={50}
                            required
                            value={form.username}
                            onChange={(event) => handleChange("username")(event.target.value)}
                            placeholder={t("pages.register.placeholder.username")}
                        />
                    </Field>
                    <Field>
                        <Label htmlFor="email">{t("pages.register.email")}</Label>
                        <Input
                            id="email"
                            type="email"
                            required
                            value={form.email}
                            onChange={(event) => handleChange("email")(event.target.value)}
                            placeholder={t("pages.register.placeholder.email")}
                        />
                    </Field>
                    <Field>
                        <Label htmlFor="password">{t("pages.register.password")}</Label>
                        <Input
                            id="password"
                            type="password"
                            minLength={8}
                            required
                            value={form.password}
                            onChange={(event) => handleChange("password")(event.target.value)}
                            placeholder={t("pages.register.placeholder.password")}
                        />
                    </Field>
                    <Field>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? t("pages.register.submitting") : t("pages.register.submit")}
                        </Button>
                    </Field>
                    <FieldSeparator>
                        {t("pages.register.hasAccount")}
                    </FieldSeparator>
                    <Field>
                        <Button
                            variant="outline"
                            type="button"
                            className="w-full"
                            onClick={() => navigate("/login")}
                        >
                            {t("pages.register.login")}
                        </Button>
                    </Field>
                </FieldGroup>
            </form>
        </div>
    );
}

