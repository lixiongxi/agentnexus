import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "@/App";
import { BuddyPage } from "@/pages/BuddyPage";
import { ChatsPage } from "@/pages/ChatsPage";
import { LoginPage } from "@/pages/LoginPage";
import { MyAgentPage } from "@/pages/MyAgentPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProtocolsPage } from "@/pages/ProtocolsPage";
import { FactoryPage } from "@/pages/FactoryPage";
import { SquarePage } from "@/pages/SquarePage";
import { SessionProvider } from "@/providers/session";
import { ToastProvider } from "@/providers/toast";
import "@/styles/tokens.css";
import "@/styles/global.css";

/** 路由表：App 为布局壳，页面组件经 Outlet 渲染 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <SquarePage /> },
      { path: "chats", element: <ChatsPage /> },
      { path: "mine", element: <MyAgentPage /> },
      { path: "factory", element: <FactoryPage /> },
      { path: "buddy", element: <BuddyPage /> },
      { path: "protocols", element: <ProtocolsPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

const container = document.getElementById("root");
if (!container) throw new Error("找不到 #root 挂载点");

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </ToastProvider>
  </StrictMode>,
);
