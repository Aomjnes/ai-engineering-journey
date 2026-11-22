"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/lf/states";
import { useShell } from "@/components/lf/shell-data";
import { usePrefs } from "@/components/lf/prefs";

/** Resumes the active lesson, or explains how to start one. */
export default function WorkspacePage() {
  const router = useRouter();
  const { status } = useShell();
  const { t } = usePrefs();
  useEffect(() => {
    if (status?.activeLessonId) router.replace(`/lesson/${status.activeLessonId}`);
  }, [status, router]);
  if (!status || status.activeLessonId) return <Skeleton className="h-64" />;
  return (
    <EmptyState
      icon={<BookOpenText />}
      title={t.workspaceEmpty.title}
      body={t.workspaceEmpty.body}
      action={<Link href="/" className={buttonVariants({ variant: "primary" })}>{t.workspaceEmpty.open}</Link>}
    />
  );
}
