import React, { useState, useEffect, useMemo, FC, useCallback } from "react";
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
import { Upload, CheckCircle, Loader2, HelpCircle, Send, Copy } from "lucide-react";
import { useTelegram } from "../hooks/useTelegram";
import { toast } from "sonner";
import { sendPaymentInfo, getPaymentSettings } from "../services/paymentServices";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../components/ui/drawer";
import { createInvoice } from "../services/telegramServices";
import { getActiveBanks } from "../services/bankServices";
import { isAbortedRequest } from "../services/api";
import { Bank } from "../types";
import { useNavigate } from "react-router-dom";

interface FormErrors {
  fullName?: string;
  bankName?: string;
  amount?: string;
  billScreenshot?: string;
}

const Payment: FC = () => {
  const [fullName, setFullName] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [billScreenshot, setBillScreenshot] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState<boolean>(true);
  const [banksError, setBanksError] = useState<boolean>(false);
  const [allowStars, setAllowStars] = useState<boolean>(false);
  const { user, openInvoice, showBackButton } = useTelegram();
  const navigate = useNavigate();

  // The admin-managed method currently picked from the "Pay using" dropdown;
  // drives the account-number box the student transfers to.
  const selectedMethod = useMemo(
    () => banks.find((b) => b.name === bankName),
    [banks, bankName]
  );

  const copyAccountNumber = async () => {
    const account = selectedMethod?.account_number;
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      toast.success("Account number copied.");
    } catch {
      toast.error("Could not copy — please select the number manually.");
    }
  };

  const loadBanks = useCallback(async () => {
    setBanksLoading(true);
    setBanksError(false);
    try {
      const list = await getActiveBanks();
      setBanks(list);
    } catch (err) {
      if (isAbortedRequest(err)) return; // cancellation, not a real failure
      setBanks([]);
      setBanksError(true);
    } finally {
      setBanksLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setBanksLoading(true);
      setBanksError(false);
      try {
        const list = await getActiveBanks();
        if (!ignore) setBanks(list);
      } catch (err) {
        // A cancelled/aborted request (StrictMode double mount, Vite dev
        // full-reload) must not render the "could not load banks" error
        // state; the ignore flag still blocks state from the dead pass.
        if (!ignore && !isAbortedRequest(err)) {
          setBanks([]);
          setBanksError(true);
        }
      } finally {
        if (!ignore) setBanksLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Telegram Stars is hidden by default: this unauthenticated read reveals it
  // only once an admin has switched it on. Aborted reads (StrictMode double
  // mount / dev reload) must not set state from a dead request.
  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    (async () => {
      try {
        const settings = await getPaymentSettings(controller.signal);
        if (!ignore) setAllowStars(settings.allow_stars);
      } catch (err) {
        if (!ignore && !isAbortedRequest(err)) setAllowStars(false);
      }
    })();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, []);

  // Clean up the object URL when the component unmounts or the file changes
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (isSuccess) {
      showBackButton(() => navigate(-1));
    }
  }, [isSuccess, showBackButton, navigate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      if (file.size > 10 * 1024 * 1024) {
        setBillScreenshot(null);
        setImagePreviewUrl("");
        setErrors({
          ...errors,
          billScreenshot: "Image must be 10MB or smaller.",
        });
        return;
      }
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
    if (!bankName) newErrors.bankName = "Please select a payment method.";
    const parsedAmount = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0)
      newErrors.amount = "Enter the transferred amount in ETB (greater than 0).";
    if (!billScreenshot)
      newErrors.billScreenshot = "A bill screenshot is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!user?.id) {
      toast.error("Your Telegram session is missing a user ID. Please reopen the app from Telegram.");
      return;
    }
    const formData = new FormData();
    try {
      setIsSubmitting(true);
      formData.append("user_id", user.id.toString());
      formData.append("fullName", fullName);
      formData.append("bankName", bankName);
      formData.append("amount", amount.trim());
      formData.append("img", billScreenshot!);

      await sendPaymentInfo(formData);
      toast.success("Payment submitted! It is pending review.", {
        style: {
          backgroundColor: "#d4edda",
          color: "#155724",
        },
      });
      setIsSuccess(true);
      resetForm();
    } catch (err) {
      const apiError = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const msg =
        apiError?.response?.data?.error ||
        apiError?.message ||
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
    setAmount("");
    setBillScreenshot(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl("");
    setErrors({});
    setIsSuccess(false);
  };
  const handlePayWithTG = async () => {
    if (!allowStars) {
      toast.error("Telegram Stars payment is not available right now.", {
        position: "top-center",
      });
      return;
    }
    try {
      if (!user?.id) {
        toast.error("Your Telegram session is missing a user ID. Please reopen the app from Telegram.");
        return;
      }
      const invoiceLink = await createInvoice(user.id);
      openInvoice(invoiceLink, async (status) => {
        if (status === "paid") {
          // The client never reports the payment as approved: Telegram
          // delivers the successful_payment update to the backend webhook,
          // which records it as Approved server-side.
          toast.success(
            "Payment received! Premium activates shortly once Telegram confirms it to our server.",
            {
              duration: 6000,
              style: {
                backgroundColor: "#d4edda",
                color: "#155724",
                border: "1px solid #c3e6cb",
                borderRadius: "8px",
              },
            }
          );
          navigate("/");
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
          toast.error("Payment failed", {
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
    } catch (error) {
      console.warn("Invoice flow failed:", error);
      toast.error("Could not start the payment. Please try again.", {
        position: "top-center",
      });
    }
  };
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="p-6 pt-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Payment Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you, {fullName}. Your payment information has been received
              and is pending review.
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
                  <DrawerTitle>Payment Methods</DrawerTitle>
                  <DrawerDescription>
                    Please use one of the following accounts to complete your
                    payment.
                  </DrawerDescription>
                </DrawerHeader>

                <div className="p-4">
                  <div className="space-y-4">
                    {banksLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading payment methods...
                      </p>
                    ) : banksError ? (
                      <p className="text-sm text-destructive">
                        Could not load payment methods. Please try again.
                      </p>
                    ) : banks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No payment methods are currently available.
                      </p>
                    ) : (
                      banks.map((bank) => (
                        <div key={bank.id}>
                          <p className="font-semibold">{bank.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Account Number: {bank.account_number}
                          </p>
                          {bank.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {bank.description}
                            </p>
                          )}
                        </div>
                      ))
                    )}
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
              <Label htmlFor="bankName">Pay using</Label>
              <Select onValueChange={setBankName} value={bankName} disabled={banksLoading || banks.length === 0}>
                <SelectTrigger id="bankName">
                  <SelectValue placeholder="Select a payment method" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.name}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {banksError && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-destructive">
                    Could not load the payment methods.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadBanks}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {!banksLoading && !banksError && banks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No payment methods are available right now. Please check
                  back soon.
                </p>
              )}
              {errors.bankName && (
                <p className="text-sm text-destructive">{errors.bankName}</p>
              )}
            </div>
            {selectedMethod?.account_number && (
              <div className="animate-in fade-in duration-300 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 dark:border-amber-500/60 dark:bg-amber-500/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Transfer to this account
                    </p>
                    <p className="font-mono text-base font-semibold break-all text-gray-900 dark:text-gray-100">
                      {selectedMethod.account_number}
                    </p>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      {selectedMethod.account_holder || selectedMethod.name}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyAccountNumber}
                    aria-label="Copy account number"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {selectedMethod.description && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {selectedMethod.description}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount Paid (ETB)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="e.g. 300"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount}</p>
              )}
            </div>
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
        {allowStars && (
          <>
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
          </>
        )}
      </Card>
    </div>
  );
};

export default Payment;
