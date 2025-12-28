import { Outlet } from "react-router";

export default function AuthLayout() {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10"
      style={{
        background:
          "radial-gradient(circle at top, rgba(15,23,42,0.08), transparent 55%)",
      }}
    >
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
