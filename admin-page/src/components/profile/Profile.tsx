import { useState, useEffect } from "react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { StatsCards } from "@/components/profile/StatsCards";
import { PaymentManagement } from "@/components/profile/PaymentManagement";
import { ContestStatistics } from "@/components/profile/ContestStatistics";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import { Toaster } from "@/components/ui/toaster";
import { User } from "@/types/user";
import { getUserProfile, deleteStudent } from "@/services/studentServices";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { id } = useParams() as { id: string }; // Assuming the user ID is passed as a URL parameter
  const navigate = useNavigate();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const res: User = await getUserProfile(id);
        // console.log("User profile data received:", res);
        // console.log("User ID field:", res.id);
        // console.log("User telegram_id field:", res.telegram_id);
        // console.log("Full user object:", JSON.stringify(res, null, 2));
        setUser(res);
        setIsLoading(false);
      } catch (error) {
        console.error("Error loading user profile:", error);
        setIsLoading(false);
      }
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

    console.log("Attempting to delete user:", {
      id: user.id,
      telegram_id: user.telegram_id,
      name: user.name,
    });

    try {
      // Use the student's telegram_id as the primary identifier for deletion
      const studentId = user.telegram_id;
      if (!studentId) {
        // console.error("User object:", user);
        // console.error("User telegram_id is undefined or null");
        throw new Error(
          "No valid telegram_id found for user. Please check the user data."
        );
      }

      // console.log("Deleting student with telegram_id:", studentId);
      // console.log("Making DELETE request to:", `/api/student/${studentId}`);
      await deleteStudent(studentId);
      toast({
        title: "User deleted",
        description: `User ${user.name} deleted.`,
      });
      navigate("/users");
    } catch (error) {
      console.error("Delete error:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        user: user,
        telegramId: user?.telegram_id,
      });
      toast({
        title: "Error deleting user",
        description:
          error instanceof Error ? error.message : "Failed to delete user.",
        variant: "destructive",
      });
    }
  };

  const handleNotifyUser = () => {
    console.log("Notifying user:", user?.id);
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-7xl">
        <ProfileHeader user={user!} />

        <div className="px-8 pb-8">
          <StatsCards user={user!} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <PaymentManagement
                user={user!}
                onDeleteUser={handleDeleteUser}
                onNotifyUser={handleNotifyUser}
              />
            </div>
            <div className="lg:col-span-2">
              <ContestStatistics user={user!} />
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}

export default Profile;
