export default function LoaderFunction() {
  const user = localStorage.getItem("user");

  return { user };
}
