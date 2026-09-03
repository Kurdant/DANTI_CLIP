import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { App } from "./App";
import "./styles.css";

// React.StrictMode retire : en React 18, son double-montage + react-router v7
// provoque un bug connu du scheduler ("Cannot read properties of undefined
// (reading 'startTime')") qui fige l'app et bloque les requetes.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
);
