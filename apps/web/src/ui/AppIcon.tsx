/** Isometric office block: the app's logo. Drawn in the theme's accent colour so it follows light/dark mode. */
export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <polygon points="16,3 29,10 16,17 3,10" fill="var(--accent)" />
      <polygon points="3,10 16,17 16,30 3,23" fill="var(--accent)" fillOpacity="0.7" />
      <polygon points="29,10 16,17 16,30 29,23" fill="var(--accent)" fillOpacity="0.45" />
      <g fill="#fff" fillOpacity="0.9">
        <polygon points="5.5,13.2 8.5,14.7 8.5,18.2 5.5,16.7" />
        <polygon points="10.5,15.7 13.5,17.2 13.5,20.7 10.5,19.2" />
        <polygon points="26.5,13.2 23.5,14.7 23.5,18.2 26.5,16.7" />
        <polygon points="21.5,15.7 18.5,17.2 18.5,20.7 21.5,19.2" />
      </g>
    </svg>
  );
}
