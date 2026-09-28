import { useEffect, useState, useCallback } from "react";
import _ from "lodash";

export interface Anchor {
  id?: string;
  offset?: { x: number; y: number };
  position?: React.CSSProperties;
}

export function useAnchorPosition(
  anchor: Anchor | undefined,
  deps: any[] = []
): React.CSSProperties | undefined {
  const { id, offset = { x: 0, y: 0 }, position = {} } = anchor || {};
  const [computedStyle, setComputedStyle] = useState<React.CSSProperties>();

  const updatePosition = useCallback(() => {
    if (id) {
      const anchorElement = document.getElementById(id);
      if (anchorElement) {
        const rect = anchorElement.getBoundingClientRect();
        setComputedStyle({
          position: "absolute",
          top: rect.top + window.scrollY + rect.height / 2 + offset.y,
          left: rect.left + window.scrollX + rect.width / 2 + offset.x,
          transform: "translate(-50%, -50%)",
          opacity: 1,
        });
        return;
      }
    }
    setComputedStyle({ position: "absolute", opacity: 1, ...position });
  }, [id, offset.x, offset.y, position]);

  useEffect(() => {
    if (!anchor) return;
    const debouncedResize = _.debounce(updatePosition, 1000);
    updatePosition();

    if (id) {
      window.addEventListener("resize", debouncedResize);
    }
    return () => {
      if (id) {
        window.removeEventListener("resize", debouncedResize);
      }
      debouncedResize.cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, updatePosition, ...deps]);

  return anchor ? computedStyle : undefined;
}
