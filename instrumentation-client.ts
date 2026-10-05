import { initBotId } from "botid/client/core";

// Server actions POST to the page that hosts the form.
initBotId({ protect: [{ path: "/", method: "POST" }] });
