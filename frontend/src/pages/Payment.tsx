import React, { useState, useEffect, FC } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Upload, CheckCircle, Loader2, HelpCircle, Send } from "lucide-react";
import { useTelegram } from "../hooks/useTelegram";
import { toast } from "sonner";
import { sendPaymentInfo } from "../services/paymentServices";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../components/ui/drawer";
import { createInvoice } from "../services/articleService";
import { PaymentRequest } from "../types";
import { useNavigate } from "react-router-dom";

interface FormErrors {
  fullName?: string;
  bankName?: string;
  otherBankName?: string;
  billScreenshot?: string;
}

const Payment: FC = () => {
  const [fullName, setFullName] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [otherBankName, setOtherBankName] = useState<string>("");
  const [billScreenshot, setBillScreenshot] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const { user, openInvoice, showBackButton } = useTelegram();
  const navigate = useNavigate();

  const banks: string[] = [
    "Bank of America",
    "JPMorgan Chase",
    "Wells Fargo",
    "Citigroup",
    "U.S. Bank",
    "PNC Bank",
    "TD Bank",
    "Capital One",
    "Other",
  ];

  // Clean up the object URL when the component unmounts or the file changes
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setBillScreenshot(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
      setErrors({ ...errors, billScreenshot: "" });
    } else {
      setBillScreenshot(null);
      setImagePreviewUrl("");
      setErrors({
        ...errors,
        billScreenshot: "Please select a valid image file.",
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!fullName.trim()) newErrors.fullName = "Full name is required.";
    if (!bankName) newErrors.bankName = "Please select a bank.";
    if (bankName === "Other" && !otherBankName.trim())
      newErrors.otherBankName = "Please specify the bank name.";
    if (!billScreenshot)
      newErrors.billScreenshot = "A bill screenshot is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;
    const formData = new FormData();
    try {
      console.log(fullName, bankName);
      setIsSubmitting(true);
      formData.append("user_id", user?.id.toString() ?? "112pay");
      formData.append("fullName", fullName);
      formData.append("bankName", bankName);
      formData.append("img", billScreenshot!);
      formData.append("status", "Pending");

      await sendPaymentInfo(formData);
      toast.success("Sucessfully sent!", {
        style: {
          backgroundColor: "#d4edda",
          color: "#155724",
        },
      });
      setIsSuccess(true);
      resetForm();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Unable to send your payment!";
      toast.error(msg, {
        style: {
          backgroundColor: "#f8d7da",
          color: "#721c24",
          border: "1px solid #f5c6cb",
          padding: "10px",
          borderRadius: "8px",
        },
        position: "bottom-center",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName("");
    setBankName("");
    setOtherBankName("");
    setBillScreenshot(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl("");
    setErrors({});
    setIsSuccess(false);
  };
  const handlePayWithTG = async () => {
    try {
      const invoiceLink = await createInvoice();
      openInvoice(invoiceLink, async (status) => {
        if (status === "paid") {
          const payment: PaymentRequest = {
            userId: user?.id.toString() ?? "",
            id: "",
            fullName: user?.first_name ?? "" + user?.last_name!,
            bankName: "Telegram Star",
            billScreenshotUrl: "",
            status: "Approved",
            createdAt: "",
            updatedAt: "",
            medium: "telegram_payment",
          };
          await sendPaymentInfo(payment);
          setIsSuccess(true);
          toast.success("Payment is successfull", {
            style: {
              backgroundColor: "green",
              color: "white",
              border: "1px solid #f59e0b",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
            },
          });
          resetForm();
          window.location.replace("/");
        } else if (status === "cancelled") {
          toast.warning("Payment is cancelled", {
            position: "top-center",
            style: {
              background: "#fef3c7",
              color: "#92400e",
              border: "1px solid #f59e0b",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
              transition: "all 0.1s ease-in-out",
            },
          });
        } else {
          toast.error("Payment is faild", {
            position: "top-center",
            style: {
              background: "red",
              color: "white",
              border: "1px solid #f59e0b",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
              transition: "all 0.1s ease-in-out",
            },
          });
        }
      });
    } catch (error) {}
  };
  if (isSuccess) {
    showBackButton(() => navigate(-1));
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="p-6 pt-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Payment Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you, {fullName}. Your payment information has been received
              and is being processed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-background h-full flex items-center justify-center">
      <Card className="w-full max-w-lg h-full shadow-none bg-transparent border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Secure Payment </span>

            <Drawer>
              <DrawerTrigger asChild>
                <button aria-label="Help">
                  <HelpCircle className="cursor-pointer" />
                </button>
              </DrawerTrigger>

              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Bank Transfer Details</DrawerTitle>
                  <DrawerDescription>
                    Please use one of the following bank accounts to complete
                    your payment.
                  </DrawerDescription>
                </DrawerHeader>

                {/* --- MODIFIED SECTION START --- */}
                <div className="p-4">
                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold">American Bank</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Account Number: 300-303-884-591
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">Suisse Bank</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Account Number: 771-CH-91283-001
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">
                        Commercial Bank of Ethiopia
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Account Number: 1000123456789
                      </p>
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </CardTitle>
          <CardDescription>
            Complete your payment by filling out the details below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank Name</Label>
              <Select onValueChange={setBankName} value={bankName}>
                <SelectTrigger id="bankName">
                  <SelectValue placeholder="Select a bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank} value={bank}>
                      {bank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.bankName && (
                <p className="text-sm text-destructive">{errors.bankName}</p>
              )}
            </div>
            {bankName === "Other" && (
              <div className="space-y-2 animate-in fade-in duration-300">
                <Label htmlFor="otherBankName">Please Specify Bank</Label>
                <Input
                  id="otherBankName"
                  placeholder="Your Bank Name"
                  value={otherBankName}
                  onChange={(e) => setOtherBankName(e.target.value)}
                />
                {errors.otherBankName && (
                  <p className="text-sm text-destructive">
                    {errors.otherBankName}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="billScreenshot">Bill Screenshot</Label>
              <div className="relative">
                <Label
                  htmlFor="billScreenshot"
                  className={`flex items-center justify-center w-full h-40 px-4 py-2 text-center border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                    errors.billScreenshot
                      ? "border-destructive"
                      : "border-border"
                  } hover:border-primary/50`}
                >
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt="Bill preview"
                      className="max-h-full max-w-full object-contain rounded-md"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                      <Upload className="w-8 h-8" />
                      <span className="font-medium">
                        Click to upload or drag and drop
                      </span>
                      <span className="text-xs">PNG, JPG, GIF up to 10MB</span>
                    </div>
                  )}
                </Label>
                <Input
                  id="billScreenshot"
                  type="file"
                  className="sr-only"
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/gif"
                />
              </div>
              {errors.billScreenshot && (
                <p className="text-sm text-destructive">
                  {errors.billScreenshot}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isSubmitting ? "Processing..." : "Submit Payment"}
            </Button>
          </form>
        </CardContent>
        <span className="text-center">or</span>
        <CardFooter className="flex-col items-start text-xs text-muted-foreground">
          <div
            onClick={handlePayWithTG}
            className=" gap-2 rounded-lg bg-[#24A1DE] flex items-center text-white p-3 mx-auto text-sm"
          >
            <Send className="text-white w-6 h-6" />
            Pay with Telegram
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Payment;
