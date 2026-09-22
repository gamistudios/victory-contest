import NotFoundSVG from "../assets/No data-cuate.svg?react";

export default function NotFound({ text }: { text: string }) {
  return (
    <div className="flex flex-col justify-center items-center gap-4">
      <NotFoundSVG className="w-64 h-64" />
      <span className="text-gray-600">{text}</span>
    </div>
  );
}
