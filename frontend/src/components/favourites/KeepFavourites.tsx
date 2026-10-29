"use client";

import { useEffect } from "react";
import { keepFavourites } from "./keep-favourites";

/**
 * Mounted once in the signed-in layout: after the app loads, the reader's favourites are kept on the device for
 * offline reading (KIT-5), even ones never opened here. Once per page load; a star changed later re-keeps that page.
 */
export function KeepFavourites() {
  useEffect(() => {
    void keepFavourites();
  }, []);
  return null;
}
