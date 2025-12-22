import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useAuthStore } from "../store/auth-store";
import { api, ApiError } from "../lib/api";
import type { AuthUser, TokenPair } from "../lib/auth-client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Login() {
    const navigate = useNavigate();
    const login = useAuthStore((state) => state.login);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            const data = await api.post<{ user: AuthUser; token: TokenPair }>("/auth/login", { email, password }, {auth: false});
            login(data);
            navigate("/", { replace: true });
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error("网络异常，请稍后重试。");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>登录 FlaiChat</CardTitle>
                <CardDescription>欢迎回来</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-6" >
                        <div className="grid gap-2">
                            <Label>邮箱</Label>
                            <Input
                                type="email"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>密码</Label>
                            <Input
                                type="password"
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
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
                            {isSubmitting ? "登录中..." : "登录"}
                        </Button>
                    </div>
                </form>
            </CardContent>
            <CardFooter className="flex justify-center">
                <div className="text-sm text-center text-muted-foreground">
                    还没有账号？{" "}
                    <Link
                        to="/register"
                        className="font-semibold text-primary hover:underline"
                    >
                        立即注册
                    </Link>
                </div>
            </CardFooter>
        </Card>
    );
}
