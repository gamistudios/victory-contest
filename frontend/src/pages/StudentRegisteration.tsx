import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { studentRegister } from "../services/studentServices";
import { useAuth } from "../context/AuthContext";
import { useTelegram } from "../hooks/useTelegram";
import { cn } from "@/lib/utils";
import { needsStreamChoice, registrationPrograms, useCatalog, type CatalogProgram } from "../shared/scope/catalog";
import LocationFields, { EMPTY_LOCATION, type LocationValue } from "../shared/scope/LocationFields";
import { ProgramPicker, StreamPicker } from "../shared/scope/ProgramPicker";

const profileSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  phoneNumber: z.string().min(10, { message: "Enter a valid phone number." }).max(13, { message: "The phone number must not exceed 13 characters." }),
  gender: z.string().min(1, { message: "Please select a gender." }),
  age: z.coerce.number().int().min(5, { message: "Student must be at least 5 years old." }),
  school: z.string().min(3, { message: "School name must be at least 3 characters." }),
});
type ProfileInput = z.input<typeof profileSchema>;
type ProfileOutput = z.output<typeof profileSchema>;

const STEPS = ["Profile", "Program", "Stream"] as const;
const GRADES = ["9", "10", "11", "12"]; // only used when the chosen program carries no grade of its own

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Registration progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold", i <= step ? "bg-blue-fix-600 text-white" : "bg-muted text-muted-foreground")}>{i < step ? "✓" : i + 1}</span>
          <span className={cn("hidden text-xs font-bold sm:block", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
          {i < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-blue-fix-600" : "bg-muted")} />}
        </li>
      ))}
    </ol>
  );
}

/** Three-step registration: 1 Profile (+ location), 2 Program, 3 Stream. Grade is derived from the program. */
export default function RegistrationForm() {
  const { user } = useTelegram();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { catalog, loading, error } = useCatalog();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loc, setLoc] = useState<LocationValue>(EMPTY_LOCATION);
  const [locErr, setLocErr] = useState("");
  const [programId, setProgramId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [grade, setGrade] = useState("");

  const form = useForm<ProfileInput, unknown, ProfileOutput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phoneNumber: "", gender: "", age: 5, school: "" },
  });

  const programs = useMemo(() => registrationPrograms(catalog), [catalog]);
  const program: CatalogProgram | undefined = programs.find((p) => p.id === programId);
  const pickStream = !!program && needsStreamChoice(program);
  const effectiveGrade = program?.grade || grade;

  const next = async () => {
    if (step === 0) {
      const ok = await form.trigger();
      const placeOk = loc.region.trim().length >= 2 && loc.city.trim().length >= 2;
      setLocErr(placeOk ? "" : "Please choose your region and city.");
      if (ok && placeOk) setStep(1);
    } else if (step === 1) {
      if (!program) return toast("Please choose your program.", { icon: <XCircle /> });
      if (!program.grade && !grade) return toast("Please choose your grade.", { icon: <XCircle /> });
      setStreamId(pickStream ? "" : "common");
      setStep(2);
    }
  };

  async function submit() {
    if (!program || (pickStream && !streamId)) return toast("Please choose your stream.", { icon: <XCircle /> });
    const values = form.getValues() as unknown as ProfileOutput;
    try {
      setSubmitting(true);
      await studentRegister({
        ...values,
        grade: effectiveGrade,
        primary_program_id: program.id,
        stream_id: pickStream ? streamId : "common",
        region_id: loc.regionId,
        city_id: loc.cityId,
        region: loc.region,
        city: loc.city,
        paid: false,
        isSuspended: false,
        age: String(values.age),
        imgurl: user?.photo_url,
        telegram_id: user?.id.toString(),
        id: user?.id.toString(),
      });
      toast.success("Successfully registered!", { icon: <CheckCircle /> });
      setTimeout(() => { refreshUser(); navigate("/"); }, 1500);
    } catch {
      toast("Something went wrong", { icon: <XCircle />, style: { backgroundColor: "hsl(var(--red-100))", color: "hsl(var(--red-800))" } });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl space-y-3 p-4" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>;
  if (error || !catalog) return <div className="mx-auto max-w-2xl p-6 text-center"><p className="text-sm font-semibold text-red-700">Could not load programs.</p><Button className="mt-3" onClick={() => window.location.reload()}>Try again</Button></div>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-safe pt-5 sm:py-8">
      <header className="space-y-4">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </div>
        <Progress step={step} />
      </header>

      <main className="mt-6 flex-1 space-y-5">
        {step === 0 && (
          <Form {...form}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void next(); }}>
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Full name *</FormLabel><FormControl><Input className="h-12 rounded-xl" placeholder="e.g., Abebe Bikila" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                <FormItem><FormLabel>Phone number *</FormLabel><FormControl><Input className="h-12 rounded-xl" inputMode="tel" placeholder="+251…" {...field} /></FormControl>
                  <FormDescription>Starts with +251, 09 or 07.</FormDescription><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="gender" render={({ field }) => (
                  <FormItem><FormLabel>Gender *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                      <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="age" render={({ field }) => (
                  <FormItem><FormLabel>Age *</FormLabel><FormControl>
                    <Input className="h-12 rounded-xl" type="number" inputMode="numeric" name={field.name} ref={field.ref} onBlur={field.onBlur} onChange={field.onChange}
                      value={field.value == null || field.value === "" ? "" : String(field.value)} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="school" render={({ field }) => (
                <FormItem><FormLabel>School *</FormLabel><FormControl><Input className="h-12 rounded-xl" placeholder="e.g., Adama High School" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <LocationFields catalog={catalog} value={loc} onChange={(v) => { setLoc(v); setLocErr(""); }} />
              {locErr && <p className="text-sm font-medium text-red-700" role="alert">{locErr}</p>}
            </form>
          </Form>
        )}

        {step === 1 && (
          <>
            <ProgramPicker programs={programs} value={programId} onChange={(p) => { setProgramId(p.id); setGrade(""); }} />
            {program && !program.grade && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Your current grade *</label>
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Grade">
                  {GRADES.map((g) => (
                    <button key={g} type="button" role="radio" aria-checked={grade === g} onClick={() => setGrade(g)}
                      className={cn("h-12 rounded-xl border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", grade === g ? "border-blue-fix-600 bg-blue-100" : "border-border bg-card")}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && program && (
          <>
            <StreamPicker catalog={catalog} program={program} value={streamId} onChange={setStreamId} />
            <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
              {[
                ["Name", form.getValues("name")],
                ["Program", program.name],
                ["Grade", effectiveGrade],
                ["Location", `${loc.city}, ${loc.region}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-semibold">{v}</dd></div>
              ))}
            </dl>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        {step > 0 && (
          <Button type="button" variant="outline" className="h-12 rounded-xl px-5" onClick={() => setStep(step - 1)} disabled={submitting} aria-label="Back">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" className="h-12 flex-1 rounded-xl bg-blue-fix-600 text-base font-extrabold text-white" onClick={() => void next()}>
            Continue <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
          </Button>
        ) : (
          <Button type="button" className="h-12 flex-1 rounded-xl bg-blue-fix-600 text-base font-extrabold text-white" onClick={() => void submit()} disabled={submitting || (pickStream && !streamId)}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        )}
      </footer>
    </div>
  );
}
