import { useAuth } from "@/context/AuthContext";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const [status, setStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | unknown>("");
  const [formData, setFormData] = useState({ email: "", password: "" });
  const navigate = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (Object.values(formData).some((value) => !value)) {
      setStatus("error");
      setErrorMessage("Fill all fields!");
      return;
    }
    setStatus("pending");
    try {
      console.log(formData);
      await login(formData.email, formData.password);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err);
    }
  };
  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md lg:max-w-sm">
        <img
          className="mx-auto h-20 w-20 rounded-full "
          src="https://res.cloudinary.com/dud4t1ptn/image/upload/v1756131905/payments/toauoplzr6rtuzipcook.jpg"
          alt="Your Company"
        />
        <h2 className="mt-8 sm:mt-10 text-center text-xl/8 sm:text-2xl/9 font-bold tracking-tight text-gray-900 break-words">
          Sign in to your account
        </h2>
      </div>

      <div className="mt-8 sm:mt-10 w-full sm:mx-auto sm:w-full sm:max-w-md lg:max-w-sm">
        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm/6 font-medium text-gray-900"
            >
              Email address
            </label>
            <div className="mt-2">
              <input
                type="email"
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="Email"
                required
                className="block border-2 w-full rounded-md px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <label
                htmlFor="password"
                className="block text-sm/6 font-medium text-gray-900"
              >
                Password
              </label>
              <div className="text-sm">
                <a
                  href="#"
                  className="font-semibold text-indigo-600 hover:text-indigo-500"
                >
                  Forgot password?
                </a>
              </div>
            </div>
            <div className="mt-2">
              <input
                type="password"
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="password"
                className="block w-full border-2 rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>
          {status == "error" && (
            <div className="py-2 px-3 bg-red-300 break-words">
              <span className="text-red-600">
                {String(errorMessage).split(":")[1]}
              </span>
            </div>
          )}
          <div>
            <button
              disabled={status === "pending"}
              type="submit"
              className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {status === "pending" ? "Signing in.." : "Sign in"}
            </button>
          </div>
        </form>

        <p className="mt-8 sm:mt-10 text-center text-sm/6 text-gray-500">
          Not a member?
          <a
            href="#"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Join victory's official channel!
          </a>
        </p>
      </div>
    </div>
  );
}
