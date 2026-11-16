import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "../../i18n.js";
import "../../write-requests.js";
import App from "./App.jsx";
import PwaRuntime from "./components/PwaRuntime.jsx";
import "./pwa.css";

const mountNode = document.getElementById("root");
if (!mountNode) throw new Error("The React frontend mount point is missing.");

const root = createRoot(mountNode);
flushSync(() => root.render(<><PwaRuntime /><App /></>));
