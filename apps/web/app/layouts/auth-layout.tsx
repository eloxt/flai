import { Outlet } from "react-router"

export default function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 overflow-y-auto bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--foreground)_8%,transparent),transparent_55%)] p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  )
}
