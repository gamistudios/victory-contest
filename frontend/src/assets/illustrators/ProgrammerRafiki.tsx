import React from "react";
import HelloSvg from "../../assets/Welcome aboard-rafiki.svg?react";
export const ProgrammerRafiki: React.FC<React.SVGProps<SVGSVGElement>> = (
  props
) => (
  <HelloSvg {...props} className={`w-full h-full ${props.className || ""}`} />
);
