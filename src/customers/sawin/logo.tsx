type LogoProps = {
  /** Farbe der Lamellen-Zwischenräume, also die Hintergrundfarbe hinter dem Logo */
  gap?: string;
  className?: string;
};

/** Logo von Sawin Bauelemente (nachgezeichnet als SVG, Eigentum des Kunden). */
export function SawinLogo({ gap = "#171717", className }: LogoProps) {
  return (
    <svg viewBox="2 4 114 81" className={className} aria-hidden="true">
      <path fill="#B3B3B3" d="M81 6L113 29V83H109V33L88 21V83H81Z" />
      <path fill="#D2B19A" d="M90 24.5L108 34.8V83H90Z" />
      <path
        stroke={gap}
        strokeWidth="1.5"
        d="M90 29.5L108 38.2M90 33.5L108 42.2M90 37.5L108 46.2M90 41.5L108 50.2M90 45.5L108 54.2"
      />
      <path
        fill="#D2B19A"
        d="M39 32L47 29.8V48.9L39 50ZM48.6 29.4L57.4 27V47.5L48.6 48.7ZM59 26.5L68 24V46L59 47.2ZM39 59.6L57 57.6V60.1L39 62.1ZM4 66.5L36 61.5V82.5H4ZM59 61.2L68 60.2V82.5H59Z"
      />
      <path
        stroke={gap}
        strokeWidth="1.4"
        d="M4 70L31 66.6M4 73.6L31 70.2M4 77.2L31 73.8M4 80.8L31 77.4"
      />
    </svg>
  );
}
