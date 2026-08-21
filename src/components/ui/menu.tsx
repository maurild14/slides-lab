"use client";

import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as ContextPrimitive from "@radix-ui/react-context-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dropdown and context menus. Radix ships them as two packages with matching
 * APIs, so they share every style here — the only difference is what opens
 * them (a trigger vs. a right-click).
 */

const CONTENT_CLASS =
  "z-(--z-popover) min-w-52 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-float outline-none";

const ITEM_CLASS =
  "relative flex h-control cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 text-body text-foreground outline-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const LABEL_CLASS = "px-2.5 py-1.5 text-label font-semibold text-muted-foreground";

const SEPARATOR_CLASS = "-mx-1 my-1 h-px bg-border-subtle";

/** Right-aligned shortcut hint inside a menu item. */
export function MenuShortcut({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto pl-6 text-micro tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

/* ----------------------------------------------------------- dropdown */

const Menu = DropdownPrimitive.Root;
const MenuTrigger = DropdownPrimitive.Trigger;
const MenuGroup = DropdownPrimitive.Group;

const MenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={8}
      data-oc-pop=""
      className={cn(CONTENT_CLASS, className)}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
MenuContent.displayName = DropdownPrimitive.Content.displayName;

const MenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & {
    destructive?: boolean;
  }
>(({ className, destructive, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      ITEM_CLASS,
      destructive && "text-destructive data-[highlighted]:bg-destructive/10",
      className
    )}
    {...props}
  />
));
MenuItem.displayName = DropdownPrimitive.Item.displayName;

const MenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownPrimitive.CheckboxItem
    ref={ref}
    className={cn(ITEM_CLASS, "pl-8", className)}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <Check className="h-4 w-4" aria-hidden />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.CheckboxItem>
));
MenuCheckboxItem.displayName = DropdownPrimitive.CheckboxItem.displayName;

const MenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Label ref={ref} className={cn(LABEL_CLASS, className)} {...props} />
));
MenuLabel.displayName = DropdownPrimitive.Label.displayName;

const MenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Separator
    ref={ref}
    className={cn(SEPARATOR_CLASS, className)}
    {...props}
  />
));
MenuSeparator.displayName = DropdownPrimitive.Separator.displayName;

/* ------------------------------------------------------ context menu */

const ContextMenu = ContextPrimitive.Root;
const ContextMenuTrigger = ContextPrimitive.Trigger;

const ContextMenuContent = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Portal>
    <ContextPrimitive.Content
      ref={ref}
      collisionPadding={8}
      data-oc-pop=""
      className={cn(CONTENT_CLASS, className)}
      {...props}
    />
  </ContextPrimitive.Portal>
));
ContextMenuContent.displayName = ContextPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Item> & {
    destructive?: boolean;
  }
>(({ className, destructive, ...props }, ref) => (
  <ContextPrimitive.Item
    ref={ref}
    className={cn(
      ITEM_CLASS,
      destructive && "text-destructive data-[highlighted]:bg-destructive/10",
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextPrimitive.Item.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Separator
    ref={ref}
    className={cn(SEPARATOR_CLASS, className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextPrimitive.Separator.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Label>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Label ref={ref} className={cn(LABEL_CLASS, className)} {...props} />
));
ContextMenuLabel.displayName = ContextPrimitive.Label.displayName;

export {
  Menu,
  MenuTrigger,
  MenuGroup,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuLabel,
  MenuSeparator,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
};
