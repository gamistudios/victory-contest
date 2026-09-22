// src/components/AdTrigger.tsx

import { useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAdsgram } from "../hooks/useAdsgram"; // Adjust path
import { ShowPromiseResult } from "../types/adsgram"; // Adjust path

export function AdTrigger() {
  const location = useLocation();
  const currentPath = location.pathname;
  const blockId = "int-13721";

  const onReward = useCallback(() => {
    console.log("Ad finished or was rewarded!");
  }, []);

  const onError = useCallback((result: ShowPromiseResult) => {
    console.error("Ad Error:", result);
  }, []);

  const showAd = useAdsgram({
    blockId: blockId,
    onReward,
    onError,
  });

  useEffect(() => {
    if (currentPath === "/contest") {
      return;
    }
    const adShownInSession = Number(sessionStorage.getItem("adShown"));
    if (adShownInSession) {
      return;
    }
    showAd();
    sessionStorage.setItem("adShown", `${adShownInSession + 1}`);
  }, [location.pathname, showAd]);

  return null;
}
