import type { SVGProps } from "react";

export type IconName =
  | "search"
  | "grid"
  | "heart"
  | "bag"
  | "user"
  | "menu"
  | "arrow"
  | "plus"
  | "minus"
  | "check"
  | "steam"
  | "coin"
  | "shield"
  | "chevron";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    heart: <path d="M20.5 9.4c0 5.1-8.5 10.1-8.5 10.1S3.5 14.5 3.5 9.4C3.5 6.7 5.4 5 7.8 5c1.6 0 3.1.9 4.2 2.3C13.1 5.9 14.6 5 16.2 5c2.4 0 4.3 1.7 4.3 4.4Z" />,
    bag: <><path d="M5 8.5h14l-1 11H6l-1-11Z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    steam: <><circle cx="8" cy="15.5" r="2.5" /><circle cx="17" cy="7" r="3" /><path d="m10.2 14.3 4.1-4.9M5.8 14.2 3 13" /><path d="m14.7 9.4 2.7 1.6" /></>,
    coin: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-3 .8-3 2s1.3 1.8 3 2c1.7.2 3 .8 3 2s-1.3 2-3 2c-1.3 0-2.5-.5-3.2-1.4M12.5 6.2v11.6" /></>,
    shield: <><path d="M12 3.5 19 6v5.3c0 4.1-2.7 7.6-7 9.2-4.3-1.6-7-5.1-7-9.2V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
  };

  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...common} {...props}>
      {paths[name]}
    </svg>
  );
}
