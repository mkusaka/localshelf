import { createRootRoute, Outlet } from "@tanstack/react-router";
import "../../app/globals.css";

export const Route = createRootRoute({
  component: () => <Outlet />,
});
