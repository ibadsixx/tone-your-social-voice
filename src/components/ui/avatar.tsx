import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

// Avatars are the single most repeated image in the product: every post, comment,
// chat row, member tile, modal and picker renders one, often many at once. This
// component wraps Radix's Image, which emits a bare <img> with no loading hint, so
// before this default every avatar in the app was an eager request competing with
// the feed's own images and videos.
//
// Defaulting to lazy fixes every call site at once, and is safe: browsers still
// load an in-viewport lazy image immediately, so the first screen of avatars is
// unaffected. A caller that genuinely needs eager can pass loading="eager", which
// wins because the spread comes last.
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, loading = "lazy", decoding = "async", ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    loading={loading}
    decoding={decoding}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
