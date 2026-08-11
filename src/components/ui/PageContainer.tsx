import * as React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "wide" | "standard" | "reading" | "form" | "canvas";
}

export function PageContainer({
  variant = "standard",
  className,
  children,
  ...props
}: PageContainerProps) {
  const widthClasses = {
    wide: "max-w-6xl",
    standard: "max-w-5xl",
    reading: "max-w-3xl",
    form: "max-w-2xl",
    canvas: "max-w-7xl w-full",
  }[variant];

  return (
    <div
      className={cn("mx-auto w-full space-y-6 animate-entrance", widthClasses, className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  metadata,
  action,
  editorial = false,
  className,
}: {
  title: string;
  description?: string;
  metadata?: React.ReactNode;
  action?: React.ReactNode;
  editorial?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-4 border-b border-border-default",
        className
      )}
    >
      <div className="space-y-1">
        <h1
          className={cn(
            "text-xl sm:text-2xl font-bold tracking-tight text-foreground",
            editorial && "font-editorial font-normal italic text-2xl sm:text-3xl"
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {(metadata || action) && (
        <div className="flex items-center gap-3 shrink-0">
          {metadata && (
            <div className="text-xs font-mono text-muted-foreground">{metadata}</div>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
