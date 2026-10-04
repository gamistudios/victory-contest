import { useState, useEffect } from "react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { StatsCards } from "@/components/profile/StatsCards";
import { PaymentManagement } from "@/components/profile/PaymentManagement";
import { ContestStatistics } from "@/components/profile/ContestStatistics";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { User, UserStats } from "@/types/user";
import {
  StudentProfileStats,
  deleteStudent,
  getStudentDetailStats,
  getStudentStats,
  getUserProfile,
  sendStudentNotification,
} from "@/services/studentServices";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<StudentProfileStats | null>(null);
  const [detailStats, setDetailStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const { id } = useParams() as { id: string }; // Assuming the user ID is passed as a URL parameter
  const navigate = useNavigate();

  useEffect(() => {
    const loadUserData = async () => {
      setIsLoading(true);
      setLoadError(null);
      // The profile, quickstat and detail-stats payloads come from three
      // endpoints; a stats failure must only degrade its own section, never
      // blank the profile, so each call settles independently.
      const [profileResult, statsResult, detailResult] = await Promise.allSettled([
        getUserProfile(id),
        getStudentStats(id),
        getStudentDetailStats(id),
      ]);

      if (profileResult.status === "fulfilled") {
        setUser(profileResult.value);
      } else {
        console.error("Error loading user profile:", profileResult.reason);
        setLoadError(
          profileResult.reason instanceof Error
            ? profileResult.reason.message
            : "Failed to load user profile."
        );
      }

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value);
      } else {
        // Stats cards render "—" in this state.
        console.error("Error loading student stats:", statsResult.reason);
        setStats(null);
      }

      if (detailResult.status === "fulfilled") {
        setDetailStats(detailResult.value);
      } else {
        // Charts show their empty state in this case.
        console.error("Error loading student detail stats:", detailResult.reason);
        setDetailStats(null);
      }

      setIsLoading(false);
    };

    loadUserData();
  }, [id]);

  const handleDeleteUser = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "No user data available",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use the student's telegram_id as the primary identifier for deletion
      const studentId = user.telegram_id;
      if (!studentId) {
        throw new Error(
          "No valid telegram_id found for user. Please check the user data."
        );
      }

      await deleteStudent(studentId);
      toast({
        title: "User deleted",
        description: `User ${user.name} deleted.`,
      });
      navigate("/users");
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error deleting user",
        description:
          error instanceof Error ? error.message : "Failed to delete user.",
        variant: "destructive",
      });
    }
  };

  const handleNotifyUser = async () => {
    const recipientId = user?.id || id;
    if (!recipientId) {
      toast({
        title: "Error",
        description: "No student identifier available to notify.",
        variant: "destructive",
      });
      return;
    }

    setIsNotifying(true);
    try {
      await sendStudentNotification({
        recipientId,
        title: "Payment Reminder",
        message: `Hello ${user?.name ?? "student"}, this is a reminder from Victory Contest: please review your subscription status so you can keep participating in contests.`,
        type: "payment_reminder",
      });
      toast({
        title: "Reminder Sent",
        description: `A notification has been sent to ${user?.name ?? "the student"}.`,
      });
    } catch (error) {
      console.error("Notify error:", error);
      toast({
        title: "Error Sending Reminder",
        description:
          error instanceof Error
            ? error.message
            : "Failed to send the notification.",
        variant: "destructive",
      });
    } finally {
      setIsNotifying(false);
    }
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-screen font-sans">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-16">
          <Card>
            <CardContent className="p-8 space-y-4">
              <h1 className="text-xl font-bold text-gray-900">
                Profile could not be loaded
              </h1>
              <p className="text-sm text-gray-600">
                {loadError ?? "The student profile is unavailable."}
              </p>
              <Button variant="outline" onClick={() => navigate("/users")}>
                Back to Users
              </Button>
            </CardContent>
          </Card>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-7xl">
        <ProfileHeader user={user} stats={stats} />

        <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8">
          <StatsCards stats={stats} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-1 min-w-0">
              <PaymentManagement
                user={user}
                isNotifying={isNotifying}
                onDeleteUser={handleDeleteUser}
                onNotifyUser={handleNotifyUser}
              />
            </div>
            <div className="lg:col-span-2 min-w-0">
              <ContestStatistics stat={detailStats ?? undefined} />
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}

export default Profile;
