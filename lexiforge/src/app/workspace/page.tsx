"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/lf/states";
import { useShell } from "@/components/lf/shell-data";

/** Resumes the active lesson, or explains how to start one. */
export default function WorkspacePage() {
  const router = useRouter();
  const { status } = useShell();
  useEffect(() => {
    if (status?.activeLessonId) router.replace(`/lesson/${status.activeLessonId}`);
  }, [status, router]);
  if (!status || status.activeLessonId) return <Skeleton className="h-64" />;
  return (
    <EmptyState
      icon={<BookOpenText />}
      title="No lesson in progress"
      body="Pick one of today's live briefings. Each lesson runs four gated stages: input & dissection, comprehension, production with repair, and an exit ticket."
      action={<Link href="/" className={buttonVariants({ variant: "primary" })}>Open Today&apos;s briefing</Link>}
    />
  );
}
