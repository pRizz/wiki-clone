/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App.tsx";
import "./index.css";
import { initObservability } from "./lib/observability";

initObservability();

const root = document.getElementById("root");

render(() => <App />, root!);
