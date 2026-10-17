// Training program admin home: track authoring + oversight.
import { useState } from "react";
import { PageTitle, Segmented } from "@/features/lectures/admin/components/kit";
import Oversight from "./Oversight";
import PlanEditor from "./PlanEditor";

export default function TrainingPage() {
  const [tab, setTab] = useState<"tracks" | "oversight">("tracks");
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <PageTitle title="Training & habits" hint="Private 30-day tracks. Progress is visible to admins only; there is no ranking and there are no points." />
      <Segmented<"tracks" | "oversight"> label="Training section" value={tab} onChange={setTab} options={[{ value: "tracks", label: "Tracks" }, { value: "oversight", label: "Oversight" }]} />
      {tab === "tracks" ? <PlanEditor /> : <Oversight />}
    </div>
  );
}
