import { createRoot } from "react-dom/client"
import { App } from "./app"
import { startWidgetHost } from "./bridge"

startWidgetHost()

const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
