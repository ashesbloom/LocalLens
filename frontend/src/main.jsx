import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { TutorialProvider } from "./context/TutorialContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TutorialProvider>
        <App />
      </TutorialProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
