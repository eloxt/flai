import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useAuthStore } from "../store/auth-store";
import { api, ApiError } from "../lib/api";
import type { AuthUser, TokenPair } from "../lib/auth-client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface RegisterPayload {
    email: string;
    username: string;
    password: string;
}

export default function Register() {
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
                toast.info("注册成功，用户未激活，请联系管理员。")
                return;
            }

            login(data);

            toast.success("注册成功，正在跳转...");
            navigate("/", { replace: true });
        } catch (error) {
            console.error(error);
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error("网络异常，请稍后重试。");
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
        <Card>
            <CardHeader>
                <CardTitle>创建账号</CardTitle>
                <CardDescription>欢迎加入</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="username">昵称</Label>
                            <Input
                                id="username"
                                type="text"
                                minLength={3}
                                maxLength={50}
                                required
                                value={form.username}
                                onChange={(event) => handleChange("username")(event.target.value)}
                                placeholder="例如：Eloxt"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">邮箱</Label>
                            <Input
                                id="email"
                                type="email"
                                required
                                value={form.email}
                                onChange={(event) => handleChange("email")(event.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">密码</Label>
                            <Input
                                id="password"
                                type="password"
                                minLength={8}
                                required
                                value={form.password}
                                onChange={(event) => handleChange("password")(event.target.value)}
                                placeholder="至少 8 位密码"
                            />
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col gap-4">
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "创建中..." : "注册"}
                        </Button>
                    </div>
                </form>
            </CardContent>
            <CardFooter className="flex justify-center">
                <div className="text-sm text-center text-muted-foreground">
                    已经拥有账号？{" "}
                    <Link
                        to="/login"
                        className="font-semibold text-primary hover:underline"
                    >
                        直接登录
                    </Link>
                </div>
            </CardFooter>
        </Card>
    );
}
