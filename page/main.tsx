import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { Root } from "./app";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Root />);
