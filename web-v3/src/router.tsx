import { createBrowserRouter } from "react-router-dom"

import { DataDemoRoute, action as dataDemoAction, loader as dataDemoLoader } from "@/routes/data-demo"
import { HomeRoute } from "@/routes/home"
import { NotFoundRoute } from "@/routes/not-found"
import { RootErrorBoundary } from "@/routes/root-error"
import { RootLayout } from "@/routes/root-layout"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <HomeRoute /> },
      {
        path: "data-demo",
        loader: dataDemoLoader,
        action: dataDemoAction,
        element: <DataDemoRoute />,
      },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
])

