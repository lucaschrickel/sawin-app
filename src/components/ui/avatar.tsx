import { cn } from "@/lib/cn";

type AvatarProps = { initials: string; name?: string; size?: "sm" | "lg"; className?: string };

export function Avatar({ initials, name, size = "sm", className }: AvatarProps) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft-2 font-semibold text-tone-brand-fg",
        size === "sm" ? "size-7 border-2 border-surface text-[10.5px]" : "size-9 text-xs",
        className,
      )}
    >
      {initials}
      {name && <span className="sr-only">{name}</span>}
    </span>
  );
}

export function AvatarStack({ people }: { people: { initials: string; name: string }[] }) {
  return (
    <span className="inline-flex [&>*+*]:-ml-[7px]">
      {people.map((p) => (
        <Avatar key={p.initials} initials={p.initials} name={p.name} />
      ))}
    </span>
  );
}
