import { useState, useEffect } from "react";
import { useTelegram } from "../hooks/useTelegram";
import {
  Trophy,
  Zap,
  Star,
  Flame,
  Brain,
  Crown,
  TrendingUp,
  Calendar,
  Lock,
  GraduationCap,
  Globe,
  Building2,
  User,
  Loader2,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Achievement, AuthStudent } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { getUserStat, updateUserInfo } from "../services/studentServices";
import { toast } from "sonner";
import TargetIcon from "../assets/target-02-stroke-rounded.svg?react";
import TimeIcon from "../assets/time-01-stroke-rounded.svg?react";
import CheckMarkIcon from "../assets/checkmark-circle-03-stroke-rounded.svg?react";
import CollapseText from "../components/ui/Collapse";
import { useAuth } from "../context/AuthContext";
import { badges } from "../lib/data";

const achievementStyles: any = {
  first: {
    icon: Trophy,
    color: "from-yellow-400 to-yellow-600",
    textColor: "text-yellow-800 dark:text-yellow-200",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    borderColor: "border-yellow-200 dark:border-yellow-800",
  },
  speed: {
    icon: Zap,
    color: "from-purple-400 to-purple-600",
    textColor: "text-purple-800 dark:text-purple-200",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  perfection: {
    icon: Star,
    color: "from-blue-400 to-blue-600",
    textColor: "text-blue-800 dark:text-blue-200",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  streak: {
    icon: Flame,
    color: "from-red-400 to-red-600",
    textColor: "text-red-800 dark:text-red-200",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    borderColor: "border-red-200 dark:border-red-800",
  },
  subject: {
    icon: Brain,
    color: "from-green-400 to-green-600",
    textColor: "text-green-800 dark:text-green-200",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    borderColor: "border-green-200 dark:border-green-800",
  },
  rank: {
    icon: Crown,
    color: "from-amber-400 to-amber-600",
    textColor: "text-amber-800 dark:text-amber-200",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
};

const getRarityBadge = (rarity: "common" | "rare" | "epic" | "legendary") => {
  const colors = {
    common: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200",
    rare: "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200",
    epic: "bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200",
    legendary: "bg-gradient-to-r from-yellow-400 to-orange-500 text-white",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[rarity]}`}
    >
      {rarity.toUpperCase()}
    </span>
  );
};

const Profile = () => {
  const { user: tgUser } = useTelegram();
  const { user, setUser, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<AuthStudent>({
    name: user?.name || "",
    grade: user?.grade || "",
    city: user?.city || "",
    region: user?.region || "",
    school: user?.school || "",
    imgurl: tgUser?.photo_url || "",
    isSuspended: user?.isSuspended || false,
    telegram_id: tgUser?.id?.toString() || "",
    id: tgUser?.id?.toString() || "",
    age: user?.age || "5",
    is_premium: user?.is_premium || false,
    read_notifications: user?.read_notifications || {},
  });

  const [userStats, setUserStats] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchStats() {
      if (!tgUser?.id) {
        if (isMounted) setProfileLoading(false);
        return;
      }

      try {
        setProfileLoading(true);
        const [stat] = await Promise.all([
          getUserStat(tgUser?.id.toString()!),
          // getUserProfile(tgUser?.id.toString()!),
        ]);

        if (isMounted) {
          // Validate stats
          if (!stat || typeof stat !== "object") {
            console.error("Invalid stats response:", stat);
            throw new Error("Invalid stats response");
          }
          setUserStats(stat);
        }
      } catch (e) {
        let message = "Unknown error";
        if (e instanceof Error) {
          message = e.message;
          if (e.message.includes("404")) {
            message = "User profile not found. Please ensure you're logged in.";
          } else if (e.message.includes("network")) {
            message = "Network error. Please check your connection.";
          }
        }
        toast.error(message, {
          description:
            "We couldn't fetch your profile data. Please check your internet connection and try again.",
          duration: 5000,
          position: "top-center",
          icon: "⚠️",
          action: {
            label: "Retry",
            onClick: () => fetchStats(),
          },
        });
      } finally {
        if (isMounted) setProfileLoading(false);
      }
    }

    fetchStats();

    if (user || tgUser) {
      setEditedProfile({
        name: user?.name || "",
        grade: user?.grade || "",
        city: user?.city || "",
        region: user?.region || "",
        school: user?.school || "",
        imgurl: tgUser?.photo_url || "",
        isSuspended: user?.isSuspended || false,
        telegram_id: tgUser?.id.toString() || "",
        id: user?.id || tgUser?.id.toString() || "", // Prioritize your backend user ID
        age: user?.age || "5",
        is_premium: user?.is_premium || false,
        read_notifications: user?.read_notifications || {},
        badge: user?.badge || [],
        phoneNumber: user?.phoneNumber || "",
      });
    }

    return () => {
      isMounted = false;
    };
  }, [tgUser]);

  const hasChanges = (() => {
    if (!user) return false;
    const fieldsToCompare: (keyof AuthStudent)[] = [
      "name",
      "grade",
      "city",
      "region",
      "school",
      "imgurl",
      "age",
    ];
    return fieldsToCompare.some(
      (key) => (editedProfile as any)[key] !== (user as any)[key]
    );
  })();

  const handleSave = async () => {
    try {
      if (editedProfile.id === "") {
        toast.error("User id is null", {
          style: {
            backgroundColor: "red",
            color: "white",
          },
        });
        return;
      }
      setSaving(true);
      await updateUserInfo(editedProfile);
      setUser((prev) => (prev ? { ...prev, ...editedProfile } : prev));
      try {
        refreshUser();
      } catch {}
      toast.success("Changes saved!", {
        style: {
          backgroundColor: "green",
          color: "white",
        },
        position: "top-center",
      });
      setIsEditing(false);
    } catch (error) {
      toast.error("Unable to save changes", {
        style: {
          backgroundColor: "red",
          color: "white",
        },
        position: "top-center",
      });
    } finally {
      setSaving(false);
    }
  };
  const achievements = badges.map((b: Achievement) => {
    return { ...b, earned: user?.badge?.includes(b.id) };
  });
  const earnedAchievements = achievements.filter((a) => a.earned === true);
  const unlockedAchievements = achievements.filter((a) => a.earned !== true);

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-blue-500"></div>
      </div>
    );
  }
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-6 relative">
          <div className="flex items-center space-x-4">
            {tgUser?.photo_url ? (
              <img
                src={tgUser.photo_url}
                alt={tgUser.first_name}
                className="w-20 h-20 rounded-full object-cover border-4 border-blue-100 dark:border-blue-900 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center border-4 border-blue-100 dark:border-blue-900 shadow-lg">
                <span className="text-white text-2xl font-bold">
                  {tgUser?.first_name?.charAt(0) || "U"}
                  {user?.name}
                </span>
              </div>
            )}
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editedProfile.name}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="min-w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg px-3 py-1 mb-2"
                />
              ) : (
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                  {tgUser?.first_name || "Student"}
                  {tgUser?.last_name && ` ${tgUser.last_name}`}
                </h2>
              )}
              <div className="flex items-center space-x-2 mb-2">
                <p className="text-gray-600 dark:text-gray-400">
                  @{tgUser?.username || "student"}
                </p>
                {tgUser?.is_premium && (
                  <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-medium rounded-full">
                    Premium
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <Badge variant={user?.isSuspended ? "destructive" : "success"}>
                  {user?.isSuspended ? "Suspended" : "Active"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <Button
                className="absolute top-0 right-0 flex border-1 border-gray-600 items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400  hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Grade Level
            </label>
            {isEditing ? (
              <Select
                value={editedProfile.grade}
                onValueChange={(value) =>
                  setEditedProfile((prev) => ({
                    ...prev,
                    grade: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a timezone" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 4 }, (_, index) => {
                    return (
                      <SelectItem value={`${9 + index}`}>{`${
                        9 + index
                      }th Grade`}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-gray-800 dark:text-white">{user?.grade}</div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Rank
            </label>
            <div className="flex items-center">
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                #{userStats?.rank || "N/A"}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                Global
              </span>
              <TrendingUp className="w-4 h-4 text-green-500 ml-2" />
            </div>
          </div>
        </div>

        <CollapseText>
          <div className="grid grid-cols-2 gap-4 transition-all duration-1000 ease-in-out data-[state=closed]:h-0 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 overflow-hidden">
            <div>
              <div className="flex dark:text-gray-300 items-center  text-sm font-medium text-gray-700 gap-2 mb-1">
                <GraduationCap />
                <h4 className=" dark:text-gray-300 ">School</h4>
              </div>
              {!isEditing ? (
                <div className="text-sm font-bold text-gray-800 dark:text-white">
                  {user?.school || "Not provided"}
                </div>
              ) : (
                <input
                  type="text"
                  value={editedProfile.school}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({
                      ...prev,
                      school: e.target.value,
                    }))
                  }
                  className="w-24 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg px-3 py-1 mb-2"
                />
              )}
            </div>
            <div>
              <div className="flex gap-2 items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Building2 className="w-5 h-5 " />
                <h4 className="">City</h4>
              </div>

              {!isEditing ? (
                <div className="text-sm font-bold text-gray-800 dark:text-white">
                  {user?.city || "Not provided"}
                </div>
              ) : (
                <input
                  type="text"
                  value={editedProfile.city}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({
                      ...prev,
                      city: e.target.value,
                    }))
                  }
                  className="w-24 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg px-3 py-1 mb-2"
                />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Globe className="w-5 h-5 " />
                <h4 className="">Region</h4>
              </div>

              {!isEditing ? (
                <div className="text-sm font-bold text-gray-600 dark:text-green-400">
                  {user?.region || "Not provided"}
                </div>
              ) : (
                <input
                  type="text"
                  value={editedProfile.region}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({
                      ...prev,
                      region: e.target.value,
                    }))
                  }
                  className="w-24 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg px-3 py-1 mb-2"
                />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <User className="w-5 h-5 " />
                <h4 className="">Age</h4>
              </div>

              {!isEditing ? (
                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {user?.age || "Not provided"} years old
                </div>
              ) : (
                <input
                  type="text"
                  value={editedProfile.age}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({
                      ...prev,
                      age: e.target.value,
                    }))
                  }
                  className="w-24 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg px-3 py-1 mb-2"
                />
              )}
            </div>
          </div>
        </CollapseText>

        {isEditing && (
          <div className="flex gap-4 space-x-0 mt-4">
            <Button
              onClick={() => setIsEditing(false)}
              className="bg-white text-black border-1 border-gray-300 hover:bg-white"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !hasChanges}
              onClick={handleSave}
              className="bg-green-50 text-green-600 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {userStats && (
          <>
            <div className="flex flex-col items-center justify-center dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                role="img"
                className="h-10 w-10 align-middl text-orange-500"
                width="1.5em"
                height="1.5em"
                preserveAspectRatio="xMidYMid meet"
                viewBox="0 0 256 256"
                style={{ fill: "currentColor" }}
              >
                <g fill="currentColor">
                  <path
                    d="M176 56a24 24 0 1 1-24-24a24 24 0 0 1 24 24"
                    opacity=".2"
                  ></path>
                  <path d="M152 88a32 32 0 1 0-32-32a32 32 0 0 0 32 32m0-48a16 16 0 1 1-16 16a16 16 0 0 1 16-16m67.31 100.68c-.61.28-7.49 3.28-19.67 3.28c-13.85 0-34.55-3.88-60.69-20a169.3 169.3 0 0 1-15.41 32.34a104.3 104.3 0 0 1 31.31 15.81C173.92 186.65 184 207.35 184 232a8 8 0 0 1-16 0c0-41.7-34.69-56.71-54.14-61.85c-.55.7-1.12 1.41-1.69 2.1c-19.64 23.8-44.25 36.18-71.63 36.18a92 92 0 0 1-9.34-.43a8 8 0 0 1 1.6-16c25.92 2.59 48.47-7.49 67-30c12.49-15.14 21-33.61 25.25-47c-38.92-22.66-63.78-3.37-64.05-3.16a8 8 0 1 1-10-12.48c1.5-1.2 37.22-29 89.51 6.57c45.47 30.91 71.93 20.31 72.18 20.19a8 8 0 1 1 6.63 14.56Z"></path>
                </g>
              </svg>
              <div className="text-2xl font-bold text-gray-800 dark:text-white">
                {userStats.totalContests}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Contests
              </div>
            </div>
            <div className="bg-white flex flex-col items-center justify-center dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <CheckMarkIcon className="w-10 h-10 text-green-500 mb-2" />
              <div className="text-2xl font-bold text-gray-800 dark:text-white">
                {userStats.correctAnswers}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Correct
              </div>
            </div>
            <div className="bg-white flex flex-col items-center justify-center dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <TargetIcon className="w-10 h-10 text-blue-500 mb-2" />
              <div className="text-2xl font-bold text-gray-800 dark:text-white">
                {userStats.accuracy}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Accuracy
              </div>
            </div>
            <div className="bg-white flex flex-col items-center justify-center dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <TimeIcon className="w-10 h-10 text-purple-500 mb-2" />
              <div className="text-2xl font-bold text-gray-800 dark:text-white">
                {userStats.averageTime}s
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Avg. Time
              </div>
            </div>
          </>
        )}
      </div>
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
              Earned Achievements ({earnedAchievements.length})
            </h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {Math.round(
                (earnedAchievements.length / achievements.length) * 100
              )}
              % Complete
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {earnedAchievements.map((achievement) => {
              const {
                icon: IconComponent,
                color,
                textColor,
                bgColor,
                borderColor,
              } = achievementStyles[achievement.type];
              return (
                <div
                  key={achievement.name}
                  className={`relative p-4 rounded-xl border-2 ${borderColor} ${bgColor} transition-all hover:scale-105 cursor-pointer group`}
                >
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}
                    >
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className={`font-bold ${textColor}`}>
                          {achievement.name}
                        </h4>
                        {getRarityBadge(
                          achievement.rarity as
                            | "common"
                            | "rare"
                            | "epic"
                            | "legendary"
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {achievement.description}
                      </p>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <Calendar className="w-3 h-3 mr-1" />
                        Earned{" "}
                        {(() => {
                          try {
                            if (!achievement.earnedDate) return "Unknown date";
                            const date = new Date(achievement.earnedDate);
                            if (isNaN(date.getTime())) return "Invalid date";
                            return date.toLocaleDateString();
                          } catch (error) {
                            console.warn("Error formatting earnedDate:", error);
                            return "Unknown date";
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
            <Lock className="w-5 h-5 mr-2 text-gray-500" />
            Locked Achievements ({unlockedAchievements.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unlockedAchievements.map((achievement) => {
              const { icon: IconComponent } =
                achievementStyles[achievement.type];
              return (
                <div
                  key={achievement.name}
                  className="relative p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 opacity-75 hover:opacity-90 transition-all"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <IconComponent className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-gray-600 dark:text-gray-400">
                          {achievement.name}
                        </h4>
                        {getRarityBadge(
                          achievement.rarity as
                            | "common"
                            | "rare"
                            | "epic"
                            | "legendary"
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
                        {achievement.description}
                      </p>
                      {achievement.progress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>Progress</span>
                            <span>{achievement.progress ?? 0}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${0}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
