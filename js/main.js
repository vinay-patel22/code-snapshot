//Entry point

import { CodeSnapshotApp } from "./app.js";

document.addEventListener("DOMContentLoaded", () => {
  const app = new CodeSnapshotApp();
  app.init();

  window.app = app;
});
