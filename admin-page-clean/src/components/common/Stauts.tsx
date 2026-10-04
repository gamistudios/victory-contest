export default function ErrorComponent({ message }: { message?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col gap-2">
        <p>{message}</p>
        <button className="bg-red-500 text-white rounded-lg px-5 font-sans">
          Refresh
        </button>
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="w-full h-full flex justify-center items-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
    </div>
  );
}
