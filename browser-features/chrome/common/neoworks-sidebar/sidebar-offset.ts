// SPDX-License-Identifier: MPL-2.0

// The collapsed sidebar sits below the top bar. Its copy of the theme image
// (sidebar.css) has to start that far above it to line up with the frame's,
// so the top bar's height is kept in a root custom property.

const TOOLBOX_ID = "navigator-toolbox";
const OFFSET_PROPERTY = "--nw-sidebar-top";

// Returns a stop function for hot reload.
export function watchSidebarOffset(): () => void {
  const toolbox = document.getElementById(TOOLBOX_ID);
  const root = document.documentElement;
  if (!toolbox || !root) {
    return () => {};
  }
  const observer = new ResizeObserver(() => {
    root.style.setProperty(OFFSET_PROPERTY, `${toolbox.getBoundingClientRect().bottom}px`);
  });
  observer.observe(toolbox);
  return () => {
    observer.disconnect();
    root.style.removeProperty(OFFSET_PROPERTY);
  };
}
