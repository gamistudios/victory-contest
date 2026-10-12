import type { AdminTreeSubject } from "@/types/academy";

export type TreeSubject = AdminTreeSubject;
export type TreeChapter = AdminTreeSubject["chapters"][number];
export type TreeModule = TreeChapter["modules"][number];
