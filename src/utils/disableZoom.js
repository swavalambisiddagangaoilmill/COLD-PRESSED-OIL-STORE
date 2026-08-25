// Keeps the storefront at a fixed viewport scale across touch and desktop browsers.
export function disableBrowserZoom() {
  const prevent = (event) => event.preventDefault();
  const preventMultiTouch = (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  };
  const preventZoomShortcut = (event) => {
    if ((event.ctrlKey || event.metaKey) && ["+", "=", "-", "0"].includes(event.key)) event.preventDefault();
  };

  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("gesturechange", prevent, { passive: false });
  document.addEventListener("gestureend", prevent, { passive: false });
  document.addEventListener("touchmove", preventMultiTouch, { passive: false });
  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
  document.addEventListener("keydown", preventZoomShortcut);
}
