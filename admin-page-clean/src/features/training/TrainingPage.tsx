// Training program admin home: track authoring + oversight.
import { useState } from "react";
import { PageTitle, Segmented } from "@/features/lectures/admin/components/kit";
import Oversight from "./Oversight";
import PlanEditor from "./PlanEditor";

export default function TrainingPage() {
  const [tab, setTab] = useState<"tracks" | "oversight">("tracks");
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <PageTitle title="Training & habits" hint="Private tracks of any length you choose. Each student sees only their own progress and admins can oversee everyone; there is no ranking and there are no points. Students enrolled in the program see Active tracks on Home, Practice and Training." />
      <Segmented<"tracks" | "oversight"> label="Training section" value={tab} onChange={setTab} options={[{ value: "tracks", label: "Tracks" }, { value: "oversight", label: "Oversight" }]} />
      {tab === "tracks" ? <PlanEditor /> : <Oversight />}
    </div>
  );
}
