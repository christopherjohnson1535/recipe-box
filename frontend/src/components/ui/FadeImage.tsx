"use client";

import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * A plain <img> that fades in once its bytes have arrived, instead of the panel showing empty and the photo popping in.
 * Server-rendered it is simply visible (no JS, no problem); on the client it is hidden before paint only while still loading,
 * so a cached image never flashes. Opacity only, so nothing moves.
 */
export function FadeImage({ className, onLoad, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [pending, setPending] = useState(false);

  useLayoutEffect(() => {
    const img = ref.current;
    if (img && !img.complete) setPending(true);
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/alt-text -- alt arrives through ...rest. Plain <img>: /media needs the session cookie, which next/image would not send.
    <img
      ref={ref}
      {...rest}
      className={`${className ?? ""} transition-opacity duration-(--duration-base) ease-(--ease-out) ${pending ? "opacity-0" : ""}`}
      onLoad={(e) => {
        setPending(false);
        onLoad?.(e);
      }}
      onError={() => setPending(false)}
    />
  );
}
