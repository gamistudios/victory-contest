import { useEffect, useState } from "react";
import api from "@/services/api";
import { describeApiError } from "@/services/feedbackServices";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Star } from "lucide-react";

// Wire shape of /api/payment-admin/settings (paymentSettingsAdminView).
interface PaymentSettings {
  allow_stars: boolean;
  stars_amount: number;
}

export function PaymentStarsSettings() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [allowStars, setAllowStars] = useState(false);
  const [starsAmount, setStarsAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/payment-admin/settings");
        setSettings(data);
        setAllowStars(data.allow_stars);
        setStarsAmount(data.stars_amount);
      } catch (e) {
        setError(describeApiError(e, "Loading payment settings"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty =
    settings !== null &&
    (allowStars !== settings.allow_stars ||
      starsAmount !== settings.stars_amount);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put("/api/payment-admin/settings", {
        allow_stars: allowStars,
        stars_amount: starsAmount,
      });
      setSettings(data);
    } catch (e) {
      setError(describeApiError(e, "Saving payment settings"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <Label htmlFor="allow-stars" className="cursor-pointer text-sm">
              Telegram Stars
            </Label>
            <Checkbox
              id="allow-stars"
              checked={allowStars}
              onCheckedChange={(c) => setAllowStars(c === true)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="stars-amount" className="text-sm text-muted-foreground">
              Amount
            </Label>
            <Input
              id="stars-amount"
              type="number"
              min={0}
              step={1}
              value={starsAmount}
              onChange={(e) => setStarsAmount(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-24"
            />
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, students see the Stars payment option with this amount;
          the switch is global.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
