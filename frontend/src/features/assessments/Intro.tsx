import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useServerClock } from "@/shared/data/useServerClock";
import { enc, getAssessment, type AssessmentMeta } from "./api";

const when = (s: string) => (s ? new Date(s).toLocaleString() : "");

/** Intro / resume screen with the late rule in plain words (plan §7.2). */
export default function Intro() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const clock = useServerClock();
  const [a, setA] = useState<AssessmentMeta | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getAssessment(id).then((m) => { clock.sync(m.server_now); setA(m); })
      .catch(() => setErr("Could not load this assessment."));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!a) return <div className="p-4 text-sm">Loading…</div>;

  const opensIn = a.start_time ? Date.parse(a.start_time) - clock.now() : 0;
  const notOpen = opensIn > 0;
  const my = a.my_attempt;
  const done = my && my.status !== "in_progress";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">{a.title}</h1>
      {a.description && <p className="text-sm opacity-80">{a.description}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        <li>{a.question_count} questions</li>
        {a.duration_minutes > 0 && <li>Time limit: {a.duration_minutes} minutes{a.mode === "self_paced" ? " from the moment you start" : ""}</li>}
        {a.start_time && <li>Opens: {when(a.start_time)}</li>}
        {a.end_time && <li>{a.mode === "self_paced" ? "On time until" : "Closes"}: {when(a.end_time)}</li>}
        {a.reveal === "at_end" && a.end_time && <li>Answers are revealed at {when(a.end_time)}, for students who have finished.</li>}
        {a.reveal === "on_submit" && <li>Answers are shown right after you submit.</li>}
      </ul>
      {a.mode === "self_paced" && a.end_time && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm">
          You can start any time, even after {when(a.end_time)}. If you <b>submit</b> after that time you lose {a.late_penalty_percent}% of your points.
          Only your first attempt is recorded.
        </p>
      )}
      {a.lock && <p className="rounded-xl bg-muted p-3 text-sm">This assessment is Premium. <Link className="underline" to="/payment">Upgrade</Link> to start.</p>}
      {notOpen && <p className="text-sm">This opens at {when(a.start_time)}.</p>}
      {done ? (
        <button className="h-12 rounded-xl bg-primary text-primary-foreground" onClick={() => nav(`/attempt/${enc(my!.id)}/result`)}>View result</button>
      ) : (
        <button className="h-12 rounded-xl bg-primary text-primary-foreground disabled:opacity-50" disabled={notOpen || !!a.lock}
          onClick={() => nav(`/assessment/${enc(a.id)}/exam`)}>{my ? "Resume" : "Start"}</button>
      )}
      <Link className="text-center text-sm underline" to={`/assessment/${enc(a.id)}/leaderboard`}>Leaderboard</Link>
    </div>
  );
}
