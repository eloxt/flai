import { Outlet } from "react-router";
import Sidebar from "../components/sidebar";
import ModelSelector from "../components/model-selector";

export default function SidebarLayout() {
    return (
        <div className="flex h-dvh w-full overflow-hidden">
            <Sidebar />
            <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                <ModelSelector />
                <Outlet />
            </main>
        </div>
    );
}
