import Image from "next/image";

export type ArchetypeMeta = { key: string; title: string; blurb?: string; share?: string; emoji?: string; color?: string };

export function ArchetypeIllustration({ archetype, size = 160, className = "" }: { archetype: string; size?: number; className?: string }) {
  return <Image src={`/archetypes/${archetype}.svg`} alt="" width={size} height={size} className={className} priority unoptimized />;
}

export function ArchetypeBadge({ meta, className = "" }: { meta: ArchetypeMeta; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
      style={{ borderColor: meta.color ?? "var(--color-border)", color: meta.color ?? "var(--color-text)" }}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.title}
    </span>
  );
}
