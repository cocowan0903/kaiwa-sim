// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// App.css は App.jsx が import している前提でOK
// SideGame.css は SideGame.jsx が import している前提でOK

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
