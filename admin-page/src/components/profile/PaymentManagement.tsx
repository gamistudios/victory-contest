import { User } from "@/types/user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CreditCard,
  Bell,
  Trash2,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  Pause,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { updateUserInfo } from "@/services/studentServices";

interface PaymentManagementProps {
  user: User;
  onDeleteUser: () => void;
  onNotifyUser: () => void;
}

export function PaymentManagement({
  user,
  onDeleteUser,
  onNotifyUser,
}: PaymentManagementProps) {
  const { id } = useParams() as { id: string };
  const [loading, setLoading] = useState({
    notice: false,
    suspend: false,
    delete: false,
  });
  function formatDate(date: string | Date | null | undefined) {
    if (!date) return "no payment";
    const d = typeof date === "string" ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const getPaymentStatusInfo = (status: string) => {
    switch (status) {
      case "active":
        return {
          color: "bg-emerald-50 text-emerald-700 border-emerald-200",
          icon: CheckCircle,
          iconColor: "text-emerald-600",
          bgColor: "bg-emerald-50",
        };
      case "overdue":
        return {
          color: "bg-red-50 text-red-700 border-red-200",
          icon: XCircle,
          iconColor: "text-red-600",
          bgColor: "bg-red-50",
        };
      case "pending":
        return {
          color: "bg-amber-50 text-amber-700 border-amber-200",
          icon: AlertCircle,
          iconColor: "text-amber-600",
          bgColor: "bg-amber-50",
        };
      case "unpaid":
        return {
          color: "bg-red-50 text-red-700 border-red-200",
          icon: Ban,
          iconColor: "text-red-600",
          bgColor: "bg-red-50",
        };
      case "inactive":
        return {
          color: "bg-gray-50 text-gray-700 border-gray-200",
          icon: Pause,
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
        };
      default:
        return {
          color: "bg-gray-50 text-gray-700 border-gray-200",
          icon: AlertCircle,
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
        };
    }
  };

  const handleDeleteUser = () => {
    onDeleteUser();
  };

  const handleNotifyUser = () => {
    onNotifyUser();
    toast({
      title: "Payment Reminder Sent",
      description: `Payment notification has been sent to ${user.name}.`,
    });
  };

  const handleSuspendAccount = async () => {
    try {
      setLoading({ ...loading, suspend: true });
      await updateUserInfo({ telegram_id: id, isSuspended: true });
      toast({
        title: "Account Suspended",
        description: `${user.name}'s account has been temporarily suspended due to unpaid fees.`,
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to suspend ${user.name}'s account. Please try again later.`,
        variant: "destructive",
      });
    } finally {
      setLoading({ ...loading, suspend: false });
    }
  };

  const handleReactivateAccount = () => {
    toast({
      title: "Account Reactivated",
      description: `${user.name}'s account has been reactivated successfully.`,
    });
  };

  const handleSendFinalNotice = async () => {
    const BOT_TOKEN = import.meta.env.VITE_BOT;
    setLoading({ ...loading, notice: true });
    try {
      const dateObj = new Date(user.payment.expirationDate);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const message = `Your next payment is due on ${formattedDate}.`;

      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: id,
          text: message,
        }),
      });

      toast({
        title: "Final Notice Sent",
        description: `Final payment notice has been sent to ${user.name}.`,
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error Sending Notice",
        description: `Failed to send final payment notice: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setLoading({ ...loading, notice: false });
    }
  };
  let paymentStatus;
  const expirationDateStr = user.payment.expirationDate;
  const today = new Date();

  if (!expirationDateStr) {
    // Case 1: No expiration date exists
    paymentStatus = "unpaid";
  } else {
    const expirationDate = new Date();

    // Case 2: Compare expiration date with today's date
    if (expirationDate >= today) {
      paymentStatus = "active";
    } else {
      paymentStatus = "unpaid";
    }
  }

  const statusInfo = getPaymentStatusInfo(paymentStatus);
  const StatusIcon = statusInfo.icon;

  // Calculate days until next payment
  const nextPayment = new Date(user.payment.expirationDate);
  const daysUntilPayment = Math.ceil(
    (nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const renderStatusSpecificContent = () => {
    switch (paymentStatus) {
      case "unpaid":
        return (
          <div className="p-4 mt-4">
            {/* <div className="flex items-center space-x-2 mb-2">
              <Ban className="w-5 h-5 text-red-600" />
              <p className="text-red-800 font-bold text-sm">PAYMENT OVERDUE</p>
            </div>
            <p className="text-red-700 text-sm mb-3">
              Payment is {Math.abs(daysUntilPayment)} days overdue. Account
              access may be restricted.
            </p> */}
            <div className="flex flex-col space-y-2">
              <Button
                disabled={loading.notice}
                onClick={handleSendFinalNotice}
                className="bg-red-600 hover:bg-red-700 text-white text-sm py-2"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                {loading.notice ? "Sending" : "Send Final Notice"}
              </Button>
              <Button
                disabled={loading.suspend}
                onClick={handleSuspendAccount}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 text-sm py-2"
              >
                <Ban className="w-4 h-4 mr-2" />
                {loading.suspend ? "Suspending" : "Suspend Account"}
              </Button>
            </div>
          </div>
        );

      case "inactive":
        return (
          <div className="bg-gray-100 border-2 border-gray-200 rounded-lg p-4 mt-4">
            <div className="flex items-center space-x-2 mb-2">
              <Pause className="w-5 h-5 text-gray-600" />
              <p className="text-gray-800 font-bold text-sm">
                ACCOUNT SUSPENDED
              </p>
            </div>
            <p className="text-gray-700 text-sm mb-3">
              Account is currently suspended. Student cannot access contests or
              materials.
            </p>
            <div className="flex flex-col space-y-2">
              <Button
                onClick={handleReactivateAccount}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Reactivate Account
              </Button>
              <Button
                onClick={handleNotifyUser}
                variant="outline"
                className="border-gray-300 text-gray-600 hover:bg-gray-50 text-sm py-2"
              >
                <Bell className="w-4 h-4 mr-2" />
                Contact Student
              </Button>
            </div>
          </div>
        );

      case "overdue":
        return (
          <div className="bg-red-100 border-2 border-red-200 rounded-lg p-4 mt-4">
            <div className="flex items-center space-x-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800 font-bold text-sm">PAYMENT OVERDUE</p>
            </div>
            <p className="text-red-700 text-sm mb-3">
              Payment is {Math.abs(daysUntilPayment)} days overdue. Please
              contact the student immediately.
            </p>
            <div className="flex flex-col space-y-2">
              <Button
                onClick={handleNotifyUser}
                className="bg-red-600 hover:bg-red-700 text-white text-sm py-2"
              >
                <Bell className="w-4 h-4 mr-2" />
                Send Urgent Reminder
              </Button>
            </div>
          </div>
        );

      case "pending":
        return (
          <div className="bg-amber-100 border-2 border-amber-200 rounded-lg p-4 mt-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800 font-bold text-sm">
                PAYMENT PENDING
              </p>
            </div>
            <p className="text-amber-700 text-sm mb-3">
              Payment is being processed. Expected confirmation within 2-3
              business days.
            </p>
          </div>
        );

      case "active":
        return (
          <div className="bg-emerald-100 border-2 border-emerald-200 rounded-lg p-4 mt-4">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <p className="text-emerald-800 font-bold text-sm">
                PAYMENT UP TO DATE
              </p>
            </div>
            <p className="text-emerald-700 text-sm">
              Next payment due in {daysUntilPayment} days. All services are
              active.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // const renderActionButtons = () => {
  //   switch (user.paymentStatus) {
  //     case "unpaid":
  //       return (
  //         <div className="flex flex-col space-y-3">
  //           <Button
  //             onClick={handleSendFinalNotice}
  //             className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
  //           >
  //             <AlertTriangle className="w-5 h-5 mr-3" />
  //             Send Final Notice
  //           </Button>
  //           <Button
  //             onClick={handleSuspendAccount}
  //             variant="outline"
  //             className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-bold py-4 text-lg rounded-xl transition-all duration-200"
  //           >
  //             <Ban className="w-5 h-5 mr-3" />
  //             Suspend Account
  //           </Button>
  //         </div>
  //       );

  //     case "inactive":
  //       return (
  //         <div className="flex flex-col space-y-3">
  //           <Button
  //             onClick={handleReactivateAccount}
  //             className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
  //           >
  //             <CheckCircle className="w-5 h-5 mr-3" />
  //             Reactivate Account
  //           </Button>
  //           <Button
  //             onClick={handleNotifyUser}
  //             variant="outline"
  //             className="w-full border-2 border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 font-bold py-4 text-lg rounded-xl transition-all duration-200"
  //           >
  //             <Bell className="w-5 h-5 mr-3" />
  //             Contact Student
  //           </Button>
  //         </div>
  //       );

  //     case "overdue":
  //       return (
  //         <div className="flex flex-col space-y-3">
  //           <Button
  //             onClick={handleNotifyUser}
  //             className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
  //           >
  //             <Bell className="w-5 h-5 mr-3" />
  //             Send Urgent Reminder
  //           </Button>
  //           <Button
  //             onClick={handleSuspendAccount}
  //             variant="outline"
  //             className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-bold py-4 text-lg rounded-xl transition-all duration-200"
  //           >
  //             <Ban className="w-5 h-5 mr-3" />
  //             Suspend Account
  //           </Button>
  //         </div>
  //       );

  //     default:
  //       return (
  //         <Button
  //           onClick={handleNotifyUser}
  //           className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
  //         >
  //           <Bell className="w-5 h-5 mr-3" />
  //           Send Payment Reminder
  //         </Button>
  //       );
  //   }
  // };

  return (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="border-b border-gray-100 ">
        <CardTitle className="flex items-center space-x-3 text-gray-900">
          <div className="rounded-xl shadow-sm">
            <CreditCard className="w-6 h-6 text-gray-500" />
          </div>
          <div>
            <span className="text-lg font-bold">Payment Management</span>
            <br />
            <span className="text-sm text-gray-600 font-normal">
              Manage subscription and billing
            </span>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Enhanced Payment Status */}
        <div
          className={`${statusInfo.bgColor} border-2 ${
            statusInfo.color.split(" ")[2]
          } rounded-xl p-2`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-4">
              <div
                className={`p-2 ${statusInfo.bgColor} rounded-xl border-2 ${
                  statusInfo.color.split(" ")[2]
                }`}
              >
                <StatusIcon className={`w-4 h-4 ${statusInfo.iconColor}`} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  Payment Status
                </h3>
                <p className="text-gray-600 text-xs">
                  Current subscription status
                </p>
              </div>
            </div>
            <Badge
              className={`${statusInfo.color} font-medium text-xs hover:bg-${statusInfo.bgColor}`}
            >
              {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
            </Badge>
          </div>

          {/* Status-specific content */}
          {renderStatusSpecificContent()}
        </div>

        {/* Enhanced Payment Timeline */}
        <div className="space-y-4">
          <h3 className="font-bold text-gray-900 text-lg flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <span>Payment Timeline</span>
          </h3>

          <div className="grid grid-cols-1 gap-4">
            <div className="border-2 bg-gray-50 border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center space-x-4">
                <div className="p-2 border-2 rounded-xl">
                  <Calendar className="w-6 h-6 text-gray-500" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">
                    Last Payment
                  </p>
                  <p className="text-gray-700 font-medium text-xs">
                    {formatDate(user.payment.createdAt)}
                  </p>
                  {/* <p className="text-gray-600 text-xs mt-1">
                    Payment received successfully
                  </p> */}
                </div>
              </div>
            </div>

            <div className="border-2 bg-gray-50 border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center space-x-4">
                <div className="p-2 rounded-xl border-2">
                  <Clock className="w-6 h-6 text-gray-500 " />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">
                    Next Payment Due
                  </p>
                  <p className="text-gray-700 font-medium text-xs">
                    {formatDate(user.payment.expirationDate)}
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    {daysUntilPayment > 0
                      ? `Due in ${daysUntilPayment} days`
                      : `${Math.abs(daysUntilPayment)} days overdue`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Amount Info
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gray-100 rounded-xl">
              <DollarSign className="w-6 h-6 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-lg">Monthly Fee</p>
              <p className="text-gray-700 font-medium text-2xl">$49.99</p>
              <p className="text-gray-600 text-sm">
                Standard subscription plan
              </p>
            </div>
          </div>
        </div> */}

        {/* Enhanced Action Buttons */}
        <div className="pt-6 border-t-2 border-gray-100">
          <div className="space-y-4">
            {/* {renderActionButtons()} */}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 font-bold py-4 text-[15px] rounded-lg transition-all duration-200"
                >
                  <Trash2 className="w-5 h-5 mr-3" />
                  Delete User Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white max-w-md">
                <AlertDialogHeader>
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="p-3 bg-red-100 rounded-xl">
                      <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>
                    <div>
                      <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                        Delete User Account
                      </AlertDialogTitle>
                      <p className="text-gray-600 text-sm mt-1">
                        This action is irreversible
                      </p>
                    </div>
                  </div>
                  <AlertDialogDescription className="text-gray-700 text-base leading-relaxed bg-gray-50 p-4 rounded-lg">
                    <strong>Warning:</strong> This will permanently delete{" "}
                    <strong>{user.name}'s</strong> account and remove all
                    associated data including:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Contest submissions and scores</li>
                      <li>Payment history and records</li>
                      <li>Performance analytics and reports</li>
                      <li>All personal information</li>
                    </ul>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="pt-6">
                  <AlertDialogCancel className="font-bold px-6 py-2">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteUser}
                    className="bg-red-600 hover:bg-red-700 font-bold px-6 py-2"
                  >
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
