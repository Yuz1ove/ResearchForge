import { cn } from "@/lib/utils";

interface BrandWordmarkProps {
  className?: string;
  forgeClassName?: string;
}

export function BrandWordmark({
  className,
  forgeClassName,
}: BrandWordmarkProps) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      <span>Research</span>
      <span className={cn("text-[#F26422]", forgeClassName)}>Forge</span>
    </span>
  );
}
