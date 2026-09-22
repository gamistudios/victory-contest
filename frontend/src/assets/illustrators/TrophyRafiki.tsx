import React from "react";
import AwardSvg from "../../assets/Product quality-pana.svg?react";
export const TrophyRafiki: React.FC<React.SVGProps<SVGSVGElement>> = (
  props
) => (
  <AwardSvg {...props} className={`w-full h-full ${props.className || ""}`} />
);
