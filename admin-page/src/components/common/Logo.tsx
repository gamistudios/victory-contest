// src/components/layout/Logo.tsx
import logoImage from "@/assets/logo.jpg"; // Make sure the path is correct

export default function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <img
        src={logoImage}
        alt="Victory Logo"
        className="h-10 w-10 rounded-full"
      />
      <h1 className="text-[25px] font-dirt">Victory</h1>
    </div>
  );
}
