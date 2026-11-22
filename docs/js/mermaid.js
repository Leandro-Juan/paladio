document.addEventListener("DOMContentLoaded", function () {
  if (typeof mermaid === "undefined") return;
  const scheme = document.body.getAttribute("data-md-color-scheme");
  mermaid.initialize({
    startOnLoad: true,
    theme: scheme === "slate" ? "dark" : "default",
  });
});
