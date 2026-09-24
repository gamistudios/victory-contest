import { useAuth } from "@/context/AuthContext";
import React, { useState } from "react";

export default function Register() {
  const { register } = useAuth();
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  //   const [imagePreview, setImagePreview] = useState<string | null>(null);
  //   const [file, setFile] = useState<File | null>(null);
  //   const [imageBinary, setImageBinary] = useState<Uint8Array | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [formData, setFormData] = useState<{
    email: string;
    password: string;
    name: string;
  }>({
    email: "",
    password: "",
    name: "",
  });

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(formData);
    if (Object.values(formData).some((value) => !value)) {
      setStatus("error");
      setErrorMessage("Fill all fields!");
      return;
    }
    setStatus("pending");
    try {
      await register(formData);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "An error occurred");
    }
  };

  //   const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  //     const file = e.target.files?.[0];
  //     if (file) {
  //       const reader = new FileReader();

  //       setFile(file);
  //       reader.readAsDataURL(file);

  //       reader.onloadend = () => {
  //         setImagePreview(reader.result as string);

  //         const binaryReader = new FileReader();
  //         binaryReader.readAsArrayBuffer(file);
  //         binaryReader.onloadend = () => {
  //           const arrayBuffer = binaryReader.result as ArrayBuffer;
  //           const binaryData = new Uint8Array(arrayBuffer);
  //           setImageBinary(binaryData);
  //         };
  //       };
  //     }
  //   };
  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img
          className="mx-auto h-10 w-auto"
          src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
          alt="Your Company"
        />
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
          Register to be Admin
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form className="space-y-6" onSubmit={handleRegister}>
          <div>
            <label
              htmlFor="name"
              className="block text-sm/6 font-medium text-gray-900"
            >
              Name
            </label>
            <div className="mt-2">
              <input
                type="text"
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Name"
                required
                className="block border-2 w-full rounded-md px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>
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
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm/6 font-medium text-gray-900"
              >
                Password
              </label>
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
          {/* <div>
            <label
              htmlFor="password"
              className="block text-sm/6 font-medium text-gray-900"
            >
              Photo
            </label>
            <div className="mt-2 mb-5 flex items-center gap-2">
              <label className="flex items-center justify-center w-[250px] h-[100px] border-2 border-dashed border-gray-300 rounded-lg cursor-pointer transition-colors duration-300 text-center p-2  hover:border-indigo-600">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="text-[#666] text-[14px]">
                  <p>
                    <strong>Click to upload</strong>
                  </p>
                  <p>SVG, PNG, JPG or GIF (max 800x400px)</p>
                </div>
              </label>
               {imageBinary && (
                  <img
                    src={imagePreview!}
                    alt="Uploaded Preview"
                    className="photo-preview"
                  />
                )} 
            </div>
          </div> */}
          {status == "error" && (
            <div className="py-2 px-3 bg-red-300">
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
              {status === "pending" ? "Processing.." : "Sign Up"}
            </button>
          </div>
        </form>

        <p className="mt-10 text-center text-sm/6 text-gray-500">
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

{
  /* <div className="mt-2 mb-5 flex items-center gap-2">
                <label className="upload-box hover:border-indigo-600">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="file-input"
                  />
                  <div className="upload-instructions">
                    <p>
                      <strong>Click to upload</strong>
                    </p>
                    <p>SVG, PNG, JPG or GIF (max 800x400px)</p>
                  </div>
                </label>
                {imageBinary && (
                  <img
                    src={imagePreview!}
                    alt="Uploaded Preview"
                    className="photo-preview"
                  />
                )}
              </div>
            </div> */
}
