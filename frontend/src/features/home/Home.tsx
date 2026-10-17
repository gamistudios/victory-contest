import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, BookOpen, Calendar, ChevronRight, ClipboardList, HelpCircle, Lock, PlayCircle, CheckCircle2, Sparkles } from "lucide-react";
import { useTelegram } from "../../hooks/useTelegram";
import { usePremiumSheet } from "../../context/PremiumSheetContext";
import { CardSkeleton, EmptyState } from "@/shared/ui/States";
import { ResourceCard } from "@/shared/ui/ResourceCard";
import { enc, type AssessmentMeta } from "../assessments/api";
import { fetchFeed, type Feed } from "./api";
import { myEnrollments, type Enrollment } from "@/shared/pricing/api";
import { useCatalog } from "@/shared/scope/catalog";
import { cn, safeFormatDistanceToNow } from "../../lib/utils";
import { ArticleListForHome } from "../../components/article/ArticleList";
import WelcomeCarousel from "../../components/WelcomeCarousell";
import ErrorState from "../../components/ErrorState";
import { isAbortedRequest } from "../../services/api";
import { ensureStudentSession } from "../../services/telegramServices";

/** Home surfaces the same `contests` table the Phase 2 screens use. Drills and
 *  archived papers belong to the Practice tab, so only competing kinds show here. */
const onHome = (a: AssessmentMeta) => a.kind !== "practice" && a.kind !== "past_exam";

const AssessmentRow = ({ a }: { a: AssessmentMeta }) => {
  const att = a.my_attempt;
  const inProgress = att?.status === "in_progress";
  const done = !!att && !inProgress;
  const scopeLabel = [a.scope?.program_id, a.scope?.stream_id && a.scope.stream_id !== "common" ? a.scope.stream_id : ""].filter(Boolean).join(" · ");
  return (
    <ResourceCard
      to={`/assessment/${enc(a.id)}`}
      title={a.title}
      scope={scopeLabel}
      access={a.lock ? "premium" : undefined}
      locked={!!a.lock}
      leading={
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", a.lock ? "bg-yellow-100 text-yellow-700" : done ? "bg-green-100 text-green-700" : inProgress ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground")}>
          {a.lock ? <Lock className="h-6 w-6" /> : done ? <CheckCircle2 className="h-6 w-6" /> : inProgress ? <PlayCircle className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
        </span>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="capitalize">{a.kind.replace(/_/g, " ")}</span>
          <span className="inline-flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" />{a.question_count}</span>
          {a.start_time && <span>{safeFormatDistanceToNow(a.start_time, "No start time")}</span>}
          {att && <span className={cn("font-semibold", inProgress ? "text-blue-700" : "text-green-700")}>{inProgress ? "In progress · tap to resume" : `Completed · ${att.points} pts`}</span>}
        </span>
      }
      trailing={<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
    />
  );
};

const Home: React.FC = () => {
  const { user, hideBackButton } = useTelegram();
  const { open: openPremium } = usePremiumSheet();
  const [feed, setFeed] = useState<Feed | null>(null);
  // Selected chip: a program id (joined or Explore) or "mine" (= all my programs).
  // "" only means "not resolved yet / no enrolments"; it is replaced by the primary program once enrolments load.
  const [program, setProgram] = useState<string>(() => localStorage.getItem("home_program") ?? "");
  const [widen, setWiden] = useState(false);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [primaryId, setPrimaryId] = useState("");
  const [enrollReady, setEnrollReady] = useState(false);
  const { catalog } = useCatalog();
  // Open/ended is decided on the server clock, not this device's.
  const [serverNow, setServerNow] = useState(() => Date.now());
  const [contestError, setContestError] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(true);

  useEffect(() => {
    hideBackButton();
  }, [hideBackButton]);

  // Joined programs lead the filter row; a failed lookup just means no "joined" group.
  useEffect(() => {
    let cancelled = false;
    ensureStudentSession()
      .then(() => myEnrollments())
      .then((e) => {
        if (cancelled) return;
        setEnrollments(e.enrollments);
        setPrimaryId(e.primary_program_id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEnrollReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const joinedIds = useMemo(() => enrollments.map((e) => e.program_id), [enrollments]);
  const defaultProgram = joinedIds.includes(primaryId) ? primaryId : joinedIds[0] ?? "";

  // Keep the selection valid: a stale/unknown/empty value falls back to the primary (else first) enrolled program.
  useEffect(() => {
    if (!enrollReady) return;
    const isJoined = joinedIds.includes(program);
    const isAll = program === "mine" && joinedIds.length >= 2;
    const isExplore = !!program && program !== "mine" && !isJoined && !!catalog?.programs.some((p) => p.id === program && p.is_active);
    if (isJoined || isAll || isExplore) return;
    // Wait for the catalog before discarding a possible Explore id.
    if (program && program !== "mine" && !catalog) return;
    if (program !== defaultProgram) setProgram(defaultProgram);
  }, [enrollReady, joinedIds, defaultProgram, program, catalog]);

  useEffect(() => {
    let cancelled = false;
    setFeed(null);
    setContestError(null);
    // /feed is a student read, so it waits on the Telegram session the provider is exchanging.
    // Program/stream filtering happens on the server; there is no client-side grade matching.
    if (!enrollReady) return;
    // The primary program is the server's default ("" = active program); anything else is sent explicitly.
    const apiProgram = program === primaryId || (program === "" && !primaryId) ? "" : program;
    ensureStudentSession()
      .then(() => fetchFeed({ program: apiProgram, stream: widen ? "all" : undefined }))
      .then((f) => {
        if (cancelled) return;
        setFeed(f);
        const s = f.assessments.length ? Date.parse(f.assessments[0].server_now) : NaN;
        if (!Number.isNaN(s)) setServerNow(s);
      })
      .catch((e) => {
        // A cancelled/aborted request (StrictMode double mount, Vite dev
        // full-reload) is not a real failure: render no error state.
        if (!cancelled && !isAbortedRequest(e)) setContestError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [triggerLoading, program, widen, enrollReady, primaryId]);

  useEffect(() => {
    localStorage.setItem("home_program", program);
  }, [program]);

  const { openContests, pastContests } = useMemo(() => {
    const open: AssessmentMeta[] = [];
    const past: AssessmentMeta[] = [];
    for (const a of feed?.assessments.filter(onHome) ?? []) {
      const end = a.end_time ? Date.parse(a.end_time) : NaN;
      (Number.isNaN(end) || end <= serverNow ? past : open).push(a);
    }
    return { openContests: open, pastContests: past };
  }, [feed, serverNow]);

  const sectionHead = (title: string, count?: number) => (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-nunito-sans text-lg font-bold text-gray-700">{title}</h2>
      {count !== undefined && (
        <div className="flex items-center text-blue-600">
          <Calendar className="mr-1 h-4 w-4" />
          <span className="text-sm font-medium">{count} Available</span>
        </div>
      )}
    </div>
  );

  const loading = feed === null && contestError === null;

  const activePrograms = (catalog?.programs ?? []).filter((p) => p.is_active);
  const nameOf = (id: string) => {
    const p = catalog?.programs.find((x) => x.id === id);
    return p?.short_code || p?.name || id;
  };
  const joinedChips = joinedIds.map((id) => ({ id, name: nameOf(id) }));
  const exploreChips = activePrograms.filter((p) => !joinedIds.includes(p.id)).map((p) => ({ id: p.id, name: p.short_code || p.name }));
  const exploring = enrollReady && !!program && program !== "mine" && !joinedIds.includes(program);
  const notJoinedAny = enrollReady && joinedIds.length === 0;

  const chipBase = "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors";
  const chipOn = "border-blue-600 bg-blue-600 text-white";

  return (
    <div className="p-4 space-y-6">
      <WelcomeCarousel user={user} />

      <div>
        {sectionHead("Read Articles")}
        <ArticleListForHome />
      </div>

      <div className="space-y-2">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label="Program">
          {joinedChips.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={program === c.id} onClick={() => setProgram(c.id)}
              className={cn(chipBase, program === c.id ? chipOn : "border-border bg-card text-foreground")}>
              {c.name}
              {c.id === primaryId && joinedChips.length > 1 && (
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold leading-4", program === c.id ? "bg-white/25 text-white" : "bg-blue-50 text-blue-700")}>Active</span>
              )}
            </button>
          ))}
          {joinedChips.length >= 2 && (
            <button type="button" role="tab" aria-selected={program === "mine"} onClick={() => setProgram("mine")}
              className={cn(chipBase, program === "mine" ? chipOn : "border-border bg-card text-foreground")}>
              All my programs
            </button>
          )}
          {exploreChips.length > 0 && (
            <>
              {joinedChips.length > 0 && <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />}
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Explore</span>
              {exploreChips.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={program === c.id} onClick={() => setProgram(c.id)}
                  className={cn(chipBase, program === c.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-dashed border-border bg-transparent font-medium text-muted-foreground")}>
                  {c.name}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex shrink-0 rounded-full bg-muted p-0.5" role="group" aria-label="Streams">
            {([["My stream", false], ["All streams", true]] as const).map(([label, v]) => (
              <button key={label} type="button" aria-pressed={widen === v} onClick={() => setWiden(v)}
                className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors", widen === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
          {(exploring || notJoinedAny) && (
            <p className="min-w-0 text-right text-xs text-muted-foreground">
              {exploring ? "Not enrolled in this program." : "You haven't joined a program yet."}{" "}
              <Link to="/programs" className="font-semibold text-blue-600">Enrol</Link>
            </p>
          )}
        </div>
      </div>

      {feed && feed.lectures.length > 0 && (
        <div>
          {sectionHead("Keep learning")}
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {feed.lectures.slice(0, 8).map((l) => (
              <ResourceCard key={l.id} className="w-40 shrink-0 flex-col items-start" to={`/academy/subject/${l.id}`} title={l.name} meta={`${l.progress_percentage}% done`} access={l.access} />
            ))}
          </div>
        </div>
      )}

      <div>
        {sectionHead("Upcoming Contests", openContests.length)}
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : contestError !== null ? (
          <ErrorState
            variant="inline"
            title="Failed to load contests"
            description="Something went wrong. Please try again!"
            onRetry={() => setTriggerLoading((prev) => !prev)}
          />
        ) : openContests.length === 0 ? (
          <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No contest open right now" hint="New contests appear here the moment they open." />
        ) : (
          <div className="space-y-3">
            {openContests.map((a) => (
              <AssessmentRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </div>

      <div>
        {sectionHead("Previous Contests")}
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : contestError !== null ? (
          <ErrorState
            variant="inline"
            title="Failed to load previous contests"
            description="Unable to load the previous contests. Please try again!"
            onRetry={() => setTriggerLoading((prev) => !prev)}
          />
        ) : pastContests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No past contests yet" hint="Finished contests stay here with their standings." />
        ) : (
          <div className="space-y-3">
            {pastContests.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
                <Link to={`/assessment/${enc(a.id)}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{a.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{safeFormatDistanceToNow(a.start_time, "No start time")} ago</span>
                    <span>•</span>
                    <span>{a.question_count} questions</span>
                  </p>
                </Link>
                {a.lock ? (
                  <button
                    type="button"
                    onClick={() => openPremium("premium_contest", a.scope?.program_id ?? a.lock?.program_id)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-yellow-700"
                    aria-label={`Unlock ${a.title}`}
                  >
                    <Lock className="h-5 w-5" />
                  </button>
                ) : (
                  <>
                    <Link
                      to={`/assessment/${enc(a.id)}/editorial`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
                      aria-label={`Answers for ${a.title}`}
                    >
                      <BookOpen className="h-5 w-5" />
                    </Link>
                    <Link
                      to={`/assessment/${enc(a.id)}/leaderboard`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
                      aria-label={`Standings for ${a.title}`}
                    >
                      <BarChart3 className="h-5 w-5" />
                    </Link>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
