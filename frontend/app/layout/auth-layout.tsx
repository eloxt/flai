import { Outlet } from "react-router";

export default function AuthLayout() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(circle at top, rgba(15,23,42,0.08), transparent 55%)",
      }}
    >
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
