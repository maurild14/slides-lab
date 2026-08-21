import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "oc-press oc-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background hover:bg-foreground/90 shadow-rest",
        accent:
          "bg-accent text-accent-foreground hover:bg-accent/90 shadow-rest",
        outline:
          "border border-border bg-surface hover:bg-muted text-foreground",
        subtle: "bg-muted text-foreground hover:bg-surface-sunken",
        ghost: "text-foreground hover:bg-muted",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 shadow-rest",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-control-sm px-3 text-label",
        default: "h-control px-4 text-body",
        lg: "h-control-lg px-6 text-body",
        icon: "h-control w-control oc-hit",
        "icon-sm": "h-control-sm w-control-sm oc-hit",
        "icon-lg": "h-control-lg w-control-lg oc-hit",
      },
    },
    defaultVariants: {
      variant: "default",
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
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

interface IconButtonProps
  extends Omit<ButtonProps, "size" | "children" | "aria-label"> {
  /** Required: an icon with no accessible name is an unusable control. */
  label: string;
  size?: "sm" | "default" | "lg";
  children: React.ReactNode;
  /** Marks a toggle as on — renders pressed and reports aria-pressed. */
  active?: boolean;
}

const ICON_SIZE = {
  sm: "icon-sm",
  default: "icon",
  lg: "icon-lg",
} as const;

/**
 * Icon-only button. Exists because every icon button in this app used to pick
 * its own height (20, 24, 28 and 40px all appeared) and several had no
 * accessible name at all.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "default", active, variant = "ghost", className, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={ICON_SIZE[size]}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(active && "bg-accent-soft text-accent", className)}
      {...props}
    />
  )
);
IconButton.displayName = "IconButton";

export { Button, IconButton, buttonVariants };
