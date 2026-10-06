import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "@/App";
import { AboutPage } from "@/pages/AboutPage";
import { CardPage } from "@/pages/CardPage";
import { ChatsPage } from "@/pages/ChatsPage";
import { LoginPage } from "@/pages/LoginPage";
import { MomentsPage } from "@/pages/MomentsPage";
import { MyAgentPage } from "@/pages/MyAgentPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PublishAgentPage } from "@/pages/PublishAgentPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { SquarePage } from "@/pages/SquarePage";
import { SessionProvider } from "@/providers/session";
import { ToastProvider } from "@/providers/toast";
import "@/styles/tokens.css";
import "@/styles/global.css";

/** 路由表：App 为布局壳，页面组件经 Outlet 渲染（个人端 v4） */
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <SquarePage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "publish", element: <PublishAgentPage /> },
      { path: "chats", element: <ChatsPage /> },
      { path: "moments", element: <MomentsPage /> },
      { path: "card/:slug", element: <CardPage /> },
      { path: "mine", element: <MyAgentPage /> },
      { path: "about", element: <AboutPage /> },
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
