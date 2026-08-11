import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "bg-secondary text-foreground border border-border-default",
        secondary:
          "bg-secondary text-muted-foreground",
        outline:
          "border border-border-default text-foreground",
        destructive:
          "bg-status-danger-subtle text-status-danger border border-status-danger/20",
        warning:
          "bg-status-warning-subtle text-status-warning border border-status-warning/20",
        success:
          "bg-status-success-subtle text-status-success border border-status-success/20",
        info:
          "bg-status-info-subtle text-status-info border border-status-info/20",
        gold:
          "bg-status-warning-subtle text-status-warning border border-status-warning/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
