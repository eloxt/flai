import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth-store";
import { api, ApiError } from "../lib/api";
import type { AuthUser, TokenPair } from "../lib/auth-client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Field, FieldGroup, FieldSeparator } from "@/components/ui/field";
import { TentTree } from "lucide-react";

export default function Login({
    className,
    ...props
}: React.ComponentProps<"div">) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            const data = await api.post<{ user: AuthUser; token: TokenPair }>("/auth/login", { email, password }, { auth: false });
            login(data);
            navigate("/", { replace: true });
        } catch (error) {
            if (error instanceof ApiError) {
                if (error.code === 1001) {
                    navigate("/activation-pending", { replace: true });
                    return;
                } else {
                    toast.error(error.message);
                }
            } else {
                toast.error(t("common.error.network"));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <form className="p-6 md:p-8" onSubmit={handleSubmit}>
                <FieldGroup>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex size-8 items-center justify-center rounded-md">
                            <TentTree className="size-6" />
                        </div>
                        <h1 className="text-xl font-bold">{t("pages.login.welcome")}</h1>
                    </div>
                    <Field>
                        <Label htmlFor="email">{t("pages.login.email")}</Label>
                        <Input
                            type="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder={t("pages.login.placeholder.email")}
                        />
                    </Field>
                    <Field>
                        <Label htmlFor="password">{t("pages.login.password")}</Label>
                        <Input
                            type="password"
                            required
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={t("pages.login.placeholder.password")}
                            autoComplete="on"
                        />
                    </Field>
                    <Field>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? t("pages.login.submitting") : t("pages.login.submit")}
                        </Button>
                    </Field>
                    <FieldSeparator>
                        {t("pages.login.noAccount")}
                    </FieldSeparator>
                    <Field>
                        <Button
                            variant="outline"
                            type="button"
                            className="w-full"
                            onClick={() => navigate("/register")}
                        >
                            {t("pages.login.register")}
                        </Button>
                    </Field>
                </FieldGroup>
            </form>
        </div>
    );
}
