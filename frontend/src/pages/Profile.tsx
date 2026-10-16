import { useState, useEffect } from "react";
import { useTelegram } from "../hooks/useTelegram";
import { Trophy, Zap, Star, Flame, Brain, Crown, TrendingUp, Calendar, Lock, GraduationCap, Globe, Building2, User, Loader2, AlertTriangle } from "lucide-react";

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
import { Link } from "react-router-dom";
import { badges } from "../lib/data";
import { CardSkeleton } from "@/academy/components/States";
import { cn } from "@/lib/utils";

interface AchievementStyle {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}

const achievementStyles: Record<string, AchievementStyle> = {
  first: {
    icon: Trophy,
    color: "from-yellow-400 to-yellow-fix-600",
    textColor: "text-yellow-800",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
  speed: {
    icon: Zap,
    color: "from-purple-400 to-purple-fix-600",
    textColor: "text-purple-800",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  perfection: {
    icon: Star,
    color: "from-blue-400 to-blue-fix-600",
    textColor: "text-blue-800",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  streak: {
    icon: Flame,
    color: "from-red-400 to-red-fix-600",
    textColor: "text-red-800",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  subject: {
    icon: Brain,
    color: "from-green-400 to-green-fix-600",
    textColor: "text-green-800",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  rank: {
    icon: Crown,
    color: "from-amber-400 to-amber-fix-600",
    textColor: "text-amber-800",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
};

const formatEarnedDate = (earnedDate?: string): string | null => {
  if (!earnedDate) return null;
  const date = new Date(earnedDate);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const getRarityBadge = (rarity: "common" | "rare" | "epic" | "legendary") => {
  const colors = {
    common: "bg-muted text-muted-foreground",
    rare: "bg-blue-100 text-blue-800",
    epic: "bg-purple-100 text-purple-800",
    legendary: "bg-gradient-to-r from-yellow-400 to-orange-fix-500 text-white",
  };

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        colors[rarity]
      )}
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

  const [userStats, setUserStats] = useState<{
    rank?: number | string;
    totalContests?: number;
    correctAnswers?: number;
    accuracy?: number;
    averageTime?: number;
  } | null>(null);
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
          getUserStat(tgUser.id.toString()),
          // getUserProfile(tgUser.id.toString()),
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
          icon: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
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

    return () => {
      isMounted = false;
    };
  }, [tgUser]);

  useEffect(() => {
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
  }, [user, tgUser]);

  const hasChanges = (() => {
    if (!user) return false;
    const current = user;
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
      (key) => editedProfile[key] !== current[key]
    );
  })();

  const handleSave = async () => {
    try {
      if (editedProfile.id === "") {
        toast.error("User id is null", {
          style: {
            backgroundColor: "hsl(var(--destructive))",
            color: "hsl(var(--destructive-foreground))",
          },
        });
        return;
      }
      setSaving(true);
      await updateUserInfo(editedProfile);
      setUser((prev) => (prev ? { ...prev, ...editedProfile } : prev));
      try {
        refreshUser();
      } catch {
        /* non-fatal: profile save succeeded even if refresh failed */
      }
      toast.success("Changes saved!", {
        style: {
          backgroundColor: "hsl(var(--success))",
          color: "hsl(var(--success-foreground))",
        },
        position: "top-center",
      });
      setIsEditing(false);
    } catch {
      toast.error("Unable to save changes", {
        style: {
          backgroundColor: "hsl(var(--destructive))",
          color: "hsl(var(--destructive-foreground))",
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
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <Link to="/programs" className="block rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-blue-700">My programs &amp; access →</Link>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            {tgUser?.photo_url ? (
              <img
                src={tgUser.photo_url}
                alt={tgUser.first_name}
                className="h-20 w-20 shrink-0 rounded-full border-4 border-blue-100 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-blue-100 bg-gradient-to-br from-blue-fix-500 to-purple-fix-600">
                <span className="text-white text-2xl font-bold">
                  {tgUser?.first_name?.charAt(0) || "U"}
                  {user?.name}
                </span>
              </div>
            )}
            <div className="min-w-0">
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
                  className="min-w-full rounded-lg border border-border bg-muted px-3 py-1 text-foreground mb-2"
                />
              ) : (
                <h2 className="font-nunito text-xl font-extrabold text-foreground">
                  {tgUser?.first_name || "Student"}
                  {tgUser?.last_name && ` ${tgUser.last_name}`}
                </h2>
              )}
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  @{tgUser?.username || "student"}
                </p>
                {user?.is_premium && (
                  <span className="shrink-0 rounded-full bg-gradient-to-r from-yellow-400 to-orange-fix-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Premium
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={user?.isSuspended ? "destructive" : "success"}>
                  {user?.isSuspended ? "Suspended" : "Active"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isEditing && (
              <Button
                className="flex items-center rounded-xl border border-border bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
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
                      <SelectItem key={9 + index} value={`${9 + index}`}>{`${
                        9 + index
                      }th Grade`}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm font-semibold text-foreground">{user?.grade}</div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Current Rank
            </label>
            <div className="flex items-center gap-2">
              <span className="font-nunito text-lg font-extrabold text-blue-700">
                #{userStats?.rank || "N/A"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Global
              </span>
              <TrendingUp className="h-4 w-4 shrink-0 text-green-600" />
            </div>
          </div>
        </div>

        <CollapseText>
          <div className="grid grid-cols-2 gap-3 transition-all duration-1000 ease-in-out data-[state=closed]:h-0 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 overflow-hidden">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <GraduationCap className="h-4 w-4 shrink-0" />
                <h4 className="min-w-0 truncate">School</h4>
              </div>
              {!isEditing ? (
                <div className="text-sm font-semibold text-foreground">
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
                  className="w-24 mb-2 rounded-lg border border-border bg-muted px-3 py-1 text-foreground"
                />
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <h4 className="min-w-0 truncate">City</h4>
              </div>

              {!isEditing ? (
                <div className="text-sm font-semibold text-foreground">
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
                  className="w-24 mb-2 rounded-lg border border-border bg-muted px-3 py-1 text-foreground"
                />
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Globe className="h-4 w-4 shrink-0" />
                <h4 className="min-w-0 truncate">Region</h4>
              </div>

              {!isEditing ? (
                <div className="text-sm font-semibold text-foreground">
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
                  className="w-24 mb-2 rounded-lg border border-border bg-muted px-3 py-1 text-foreground"
                />
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <h4 className="min-w-0 truncate">Age</h4>
              </div>

              {!isEditing ? (
                <div className="text-sm font-semibold text-blue-700">
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
                  className="w-24 mb-2 rounded-lg border border-border bg-muted px-3 py-1 text-foreground"
                />
              )}
            </div>
          </div>
        </CollapseText>

        {isEditing && (
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => setIsEditing(false)}
              className="border border-border bg-card text-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !hasChanges}
              onClick={handleSave}
              className="bg-green-100 text-green-700 font-semibold hover:bg-green-200 disabled:opacity-50"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {userStats && (
          <>
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  role="img"
                  className="h-6 w-6"
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
              </span>
              <div className="font-nunito text-lg font-extrabold text-foreground">
                {userStats.totalContests}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Contests
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                <CheckMarkIcon className="h-6 w-6" />
              </span>
              <div className="font-nunito text-lg font-extrabold text-foreground">
                {userStats.correctAnswers}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Correct
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <TargetIcon className="h-6 w-6" />
              </span>
              <div className="font-nunito text-lg font-extrabold text-foreground">
                {userStats.accuracy}%
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Accuracy
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                <TimeIcon className="h-6 w-6" />
              </span>
              <div className="font-nunito text-lg font-extrabold text-foreground">
                {userStats.averageTime}s
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Avg. Time
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-700">
                <Trophy className="h-5 w-5" />
              </span>
              <h3 className="font-nunito text-base font-extrabold text-foreground">
                Earned Achievements ({earnedAchievements.length})
              </h3>
            </div>
            <div className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {Math.round(
                (earnedAchievements.length / achievements.length) * 100
              )}
              % Complete
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                  className={cn(
                    "group relative cursor-pointer rounded-2xl border-2 p-3 transition-all hover:scale-105",
                    borderColor,
                    bgColor
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br",
                        color
                      )}
                    >
                      <IconComponent className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <h4 className={`text-sm font-bold ${textColor}`}>
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
                      <p className="text-xs text-muted-foreground">
                        {achievement.description}
                      </p>
                      {formatEarnedDate(achievement.earnedDate) && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3 shrink-0" />
                          Earned {formatEarnedDate(achievement.earnedDate)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-card/10 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Lock className="h-5 w-5" />
            </span>
            <h3 className="font-nunito text-base font-extrabold text-foreground">
              Locked Achievements ({unlockedAchievements.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {unlockedAchievements.map((achievement) => {
              const { icon: IconComponent } =
                achievementStyles[achievement.type];
              return (
                <div
                  key={achievement.name}
                  className="relative rounded-2xl border border-border bg-card p-3 opacity-75 transition-all hover:opacity-90"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <h4 className="text-sm font-bold text-muted-foreground">
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
                      <p className="text-xs text-muted-foreground">
                        {achievement.description}
                      </p>
                      {achievement.progress && (
                        <div className="mt-1">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Progress</span>
                            <span>{achievement.progress ?? 0}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-border">
                            <div
                              className="bg-gradient-to-r from-blue-fix-500 to-purple-fix-600 h-1.5 rounded-full transition-all duration-300"
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
