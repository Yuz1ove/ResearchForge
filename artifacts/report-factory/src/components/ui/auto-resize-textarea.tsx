import * as React from "react";

import { Textarea } from "@/components/ui/textarea";

type AutoResizeTextareaProps = Omit<
  React.ComponentPropsWithoutRef<"textarea">,
  "rows"
> & {
  minRows?: number;
  maxHeightPx?: number;
};

type ResizableTextareaElement = Pick<
  HTMLTextAreaElement,
  "clientHeight" | "offsetHeight" | "scrollHeight" | "style"
>;

export function resizeTextareaToContent(
  textarea: ResizableTextareaElement,
  maxHeightPx: number,
): void {
  textarea.style.height = "auto";
  const borderHeight = Math.max(0, textarea.offsetHeight - textarea.clientHeight);
  const contentHeight = textarea.scrollHeight + borderHeight;
  const nextHeight = Math.min(contentHeight, maxHeightPx);

  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > maxHeightPx ? "auto" : "hidden";
}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(
  (
    {
      minRows = 2,
      maxHeightPx = 360,
      onInput,
      style,
      value,
      ...props
    },
    forwardedRef,
  ) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setTextareaRef = React.useCallback(
      (textarea: HTMLTextAreaElement | null) => {
        internalRef.current = textarea;
        if (typeof forwardedRef === "function") {
          forwardedRef(textarea);
        } else if (forwardedRef) {
          forwardedRef.current = textarea;
        }
      },
      [forwardedRef],
    );

    const resize = React.useCallback(() => {
      if (!internalRef.current) return;
      resizeTextareaToContent(internalRef.current, maxHeightPx);
    }, [maxHeightPx]);

    React.useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    React.useEffect(() => {
      const textarea = internalRef.current;
      if (!textarea || typeof ResizeObserver === "undefined") return;

      let previousWidth = textarea.clientWidth;
      const observer = new ResizeObserver(() => {
        const nextWidth = textarea.clientWidth;
        if (nextWidth === previousWidth) return;
        previousWidth = nextWidth;
        resize();
      });
      observer.observe(textarea);
      return () => observer.disconnect();
    }, [resize]);

    return (
      <Textarea
        {...props}
        ref={setTextareaRef}
        value={value}
        rows={minRows}
        onInput={(event) => {
          resizeTextareaToContent(event.currentTarget, maxHeightPx);
          onInput?.(event);
        }}
        style={{
          ...style,
          maxHeight: `${maxHeightPx}px`,
        }}
      />
    );
  },
);

AutoResizeTextarea.displayName = "AutoResizeTextarea";
