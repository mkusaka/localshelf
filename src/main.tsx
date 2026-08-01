import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

const root = document.getElementById("root");

if (!root) throw new Error("LocalShelf root element was not found.");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
