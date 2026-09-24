import { useQuery } from "@tanstack/react-query";

// Shadcn/ui & Lucide Icons
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown } from "lucide-react";
import { getRankings } from "@/services/contestServices";
import { Rank } from "@/types/contestTypes";
import { Button } from "../ui/button";

// Sub-component for a single ranking item
function LeaderboardItem({ user, rank }: { user: Rank; rank: number }) {
  const rankColors: { [key: number]: string } = {
    1: "text-amber-400",
    2: "text-slate-400",
    3: "text-amber-600",
  };

  return (
    <div className="flex items-center gap-4 p-2 rounded-md hover:bg-muted/50">
      <div className="flex items-center justify-center w-8 font-bold text-lg text-muted-foreground">
        {rank <= 3 ? <Crown className={`h-6 w-6 ${rankColors[rank]}`} /> : rank}
      </div>
      <Avatar>
        <AvatarImage src={user.imgurl} alt={user.user_name} />
        <AvatarFallback>
          {user.user_name?.[0]?.toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 truncate">
        <p className="font-semibold truncate">{user.user_name}</p>
        <p className="text-sm text-muted-foreground">{user.score} Points</p>
      </div>
    </div>
  );
}

export function Leaderboard() {
  const { data: rankings, status } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => (await getRankings()).leaderboard || [],
  });

  return (
    <Card className="sticky top-4" style={{ boxShadow: "0 0 1px #9c9898" }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-6 w-6 text-amber-500" />
            Top Players
          </CardTitle>
          <Button variant="ghost" size="sm">
            View All
          </Button>
        </div>
        <CardDescription>
          {status === "success" &&
            `Live ranking of all ${rankings.length} rated users.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {status === "pending" &&
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-2">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          {status === "success" &&
            rankings.slice(0, 10).map(
              (
                user,
                index // Show top 10
              ) => (
                <LeaderboardItem
                  key={user.user_id}
                  user={user}
                  rank={index + 1}
                />
              )
            )}
        </div>
      </CardContent>
    </Card>
  );
}
