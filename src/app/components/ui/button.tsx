import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// shadcn Button adapted to tokens.json (S-007): every size is at least 44 px tall
// (size.tap-target), height grows so FR labels wrap instead of truncating, radius
// full (component.button.radius), and focus uses the global 2 px solid ring outline
// from app.css (ring token, >= 3:1 on the page in both themes).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-center font-semibold transition-colors duration-(--motion-fast) select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-strong",
        outline: "border-input bg-background hover:bg-muted",
        secondary: "bg-muted text-foreground hover:bg-accent",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "text-primary-strong underline underline-offset-4",
      },
      size: {
        default: "min-h-11 gap-2 px-5 py-2 text-base",
        xs: "min-h-11 gap-1 px-3 py-1 text-sm",
        sm: "min-h-11 gap-1.5 px-4 py-1.5 text-sm",
        lg: "min-h-12 gap-2 px-6 py-2 text-base",
        icon: "size-11",
        "icon-xs": "size-11",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
