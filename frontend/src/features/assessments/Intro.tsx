import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, ClipboardList, Clock, HelpCircle, Lock, PlayCircle, Trophy } from "lucide-react";
import { useServerClock } from "@/shared/data/useServerClock";
import { usePremiumSheet } from "@/context/PremiumSheetContext";
import { CardSkeleton, InlineError } from "@/academy/components/States";
import { cn } from "@/lib/utils";
import { enc, getAssessment, registerForAssessment, type AssessmentMeta } from "./api";
import { formatCountdown } from "./Timer";

const day = (s: string) => (s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

/** Intro / resume screen with the late rule in plain words (plan §7.2). */
export default function Intro() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { open: openPremium } = usePremiumSheet();
  const clock = useServerClock();
  const [a, setA] = useState<AssessmentMeta | null>(null);
  const [err, setErr] = useState("");
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    getAssessment(id).then((m) => { clock.sync(m.server_now); setA(m); setRegistered(!!m.registered); })
      .catch(() => setErr("Could not load this assessment."));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const register = async () => {
    if (!a) return;
    setBusy(true);
    try {
      await registerForAssessment(a.id);
      setRegistered(true);
    } catch {
      setErr("Could not sign you up. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // One second tick so the "opens in" / "closes in" countdown moves on its own.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (err) return <div className="mx-auto max-w-xl p-4"><InlineError message={err} onRetry={() => { setErr(""); void getAssessment(id).then((m) => { clock.sync(m.server_now); setA(m); }); }} /></div>;
  if (!a) return <div className="mx-auto max-w-xl space-y-3 p-4"><CardSkeleton /><CardSkeleton /></div>;

  const now = clock.now();
  const opensIn = a.start_time ? Date.parse(a.start_time) - now : 0;
  const notOpen = opensIn > 0;
  const closesIn = a.end_time ? Date.parse(a.end_time) - now : 0;
  const my = a.my_attempt;
  const done = my && my.status !== "in_progress";
  // A global (window) contest can only be started before it closes; self-paced
  // ones stay open past the end time and take the late penalty instead.
  const closed = !my && a.mode === "global" && closesIn <= 0;
  // Sign-up comes before joining, exactly as the legacy contest card enforced it.
  const needsRegister = !!a.needs_registration && !my && !a.lock && !registered;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            a.lock ? "bg-yellow-100 text-yellow-700" : done ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
            {a.lock ? <Lock className="h-6 w-6" /> : done ? <CheckCircle2 className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <h1 className="font-nunito text-lg font-extrabold text-foreground">{a.title}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5 font-semibold capitalize">{a.kind.replace(/_/g, " ")}</span>
              <span className="inline-flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" />{a.question_count}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{a.duration_minutes > 0 ? `${a.duration_minutes} min` : "Until it closes"}</span>
            </p>
          </div>
        </div>
        {a.description && <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/80">{a.description}</p>}
      </div>

      <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
        {a.start_time && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
            <span>{notOpen ? <>Opens at {day(a.start_time)} · <b className="text-foreground">in {formatCountdown(opensIn)}</b></> : `Opened ${day(a.start_time)}`}</span>
          </li>
        )}
        {a.end_time && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            <span>{a.mode === "self_paced" ? "On time until" : "Closes"} {day(a.end_time)}{!notOpen && closesIn > 0 ? ` · in ${formatCountdown(closesIn)}` : ""}</span>
          </li>
        )}
        {a.reveal === "at_end" && a.end_time && (
          <li className="flex items-center gap-2 text-muted-foreground"><Trophy className="h-4 w-4 shrink-0" aria-hidden />Answers are revealed at {day(a.end_time)}, for students who have finished.</li>
        )}
        {a.reveal === "on_submit" && (
          <li className="flex items-center gap-2 text-muted-foreground"><Trophy className="h-4 w-4 shrink-0" aria-hidden />Answers are shown right after you submit.</li>
        )}
      </ul>

      {a.mode === "self_paced" && a.end_time && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You can start any time, even after {day(a.end_time)}. If you <b>submit</b> after that time you lose {a.late_penalty_percent}% of your points.
          Only your first attempt is recorded.
        </p>
      )}
      {a.lock && (
        <button type="button" onClick={() => openPremium("premium_contest")}
          className="rounded-2xl border border-border bg-muted p-3 text-left text-sm">
          This assessment is Premium. <span className="font-semibold underline">See plans</span> to start.
        </button>
      )}
      {closed && <p className="rounded-2xl border border-border bg-muted p-3 text-sm text-muted-foreground">This closed at {day(a.end_time)}. It is no longer open for new attempts.</p>}

      {done ? (
        <button className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground" onClick={() => nav(`/attempt/${enc(my!.id)}/result`)}>
          View result · {my!.points} pts
        </button>
      ) : needsRegister ? (
        /* The legacy contest card let a student join only after signing up; the
           roster row it wrote is what the admin registration stats count. */
        <button className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          disabled={busy} onClick={() => void register()}>
          {busy ? "Registering…" : "Register to join"}
        </button>
      ) : (
        <button className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          disabled={notOpen || closed || !!a.lock} onClick={() => nav(`/assessment/${enc(a.id)}/exam`)}>
          <PlayCircle className="mr-1 inline h-4 w-4" aria-hidden />
          {my ? `Resume · ${formatCountdown(Math.max(0, Date.parse(my.expires_at) - now))} left`
            : closed ? "Closed" : notOpen ? "Wait for it to open" : "Start"}
        </button>
      )}
      {closed && a.reveal !== "on_submit" && (
        <Link className="text-center text-sm underline text-muted-foreground" to={`/assessment/${enc(a.id)}/editorial`}>See the answers</Link>
      )}
      <Link className="text-center text-sm underline text-muted-foreground" to={`/assessment/${enc(a.id)}/leaderboard`}>Leaderboard</Link>
    </div>
  );
}
