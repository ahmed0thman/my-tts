/**
 * Pages laid out as a workspace: settings fixed on the right, a scrollable
 * grid of clips on the left (src/components/layout/workspace-split.tsx).
 * On large screens they fill the window instead of scrolling as a page, and
 * they use the full width so the grid can reach three columns.
 */
export function isWorkspaceRoute(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === '/' ||
    /^\/projects\/[^/]+\/episodes\/[^/]+\/?$/.test(pathname) ||
    /^\/dubbing\/[^/]+\/?$/.test(pathname)
  );
}
