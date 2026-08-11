import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs active:scale-[0.98]",
        secondary:
          "bg-secondary text-foreground hover:bg-surface-3 border border-border-default active:scale-[0.98]",
        outline:
          "border border-border-default bg-transparent text-foreground hover:bg-secondary active:scale-[0.98]",
        ghost:
          "text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-[0.98]",
        editorial:
          "text-foreground hover:text-primary font-editorial italic underline underline-offset-4 decoration-border-strong hover:decoration-primary p-0 h-auto bg-transparent active:scale-[0.99]",
        destructive:
          "bg-destructive text-white hover:opacity-90 active:scale-[0.98]",
      },
      size: {
        default: "h-8 px-3.5 py-1.5 text-xs min-h-[36px] sm:min-h-[32px]",
        sm: "h-7 px-2.5 text-[11px] min-h-[32px] sm:min-h-[28px]",
        lg: "h-9 px-4 text-sm min-h-[40px]",
        icon: "h-8 w-8 min-h-[36px] min-w-[36px] sm:min-h-[32px] sm:min-w-[32px]",
        touch: "h-11 px-4 text-sm min-h-[44px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
