import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Renderer mounted without #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
