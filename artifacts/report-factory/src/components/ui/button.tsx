import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "interactive-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border-destructive-border",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          " border [border-color:var(--button-outline)] shadow-xs active:shadow-none ",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border bg-secondary text-secondary-foreground border border-secondary-border ",
        // @replit no hover, transparent border
        ghost: "border border-transparent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      onPointerMove,
      onPointerLeave,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"

    const updatePointerGlow = (event: React.PointerEvent<HTMLButtonElement>) => {
      const target = event.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100
      const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100
      target.style.setProperty("--button-pointer-x", `${x.toFixed(2)}%`)
      target.style.setProperty("--button-pointer-y", `${y.toFixed(2)}%`)
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerMove={(event) => {
          onPointerMove?.(event)
          updatePointerGlow(event)
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event)
          const target = event.currentTarget as HTMLElement
          target.dataset.pressed = "false"
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event)
          updatePointerGlow(event)
          const target = event.currentTarget as HTMLElement
          target.dataset.pressed = "true"
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event)
          const target = event.currentTarget as HTMLElement
          target.dataset.pressed = "false"
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event)
          const target = event.currentTarget as HTMLElement
          target.dataset.pressed = "false"
        }}
        onBlur={(event) => {
          onBlur?.(event)
          const target = event.currentTarget as HTMLElement
          target.dataset.pressed = "false"
        }}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
