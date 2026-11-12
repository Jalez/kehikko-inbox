import { ChevronDown } from 'lucide-react'
import type * as React from 'react'

import { cn } from 'kehikot-module-protocol/client/ui'

/**
 * shadcn's native select: the browser's own `<select>`, styled as an input, with a chevron. Native so
 * that keyboard, screen readers and a phone's picker are the platform's, and nothing new is installed.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full min-w-0" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          'border-input flex h-7 w-full min-w-0 appearance-none rounded-md border bg-transparent py-0.5 pr-7 pl-2 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          className,
        )}
        {...props}
      />
      <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" aria-hidden />
    </div>
  )
}

function NativeSelectOption(props: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />
}

export { NativeSelect, NativeSelectOption }
