import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import type { CustomThemeInput } from "@/lib/themes";
import { ToastProvider } from "@/components/ui";
import { WorkspaceProvider } from "@/components/workspace";
import { AppShell } from "@/components/app-shell";
import { ThemeBoot } from "@/components/theme-boot";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const workspace = await loadWorkspace(user.id);

  const custom: CustomThemeInput | null =
    workspace.settings.theme === "custom"
      ? {
          primary: workspace.settings.customPrimary,
          accent: workspace.settings.customAccent,
          background: workspace.settings.customBackground,
          card: workspace.settings.customCard,
          radius: workspace.settings.customRadius,
          mode: workspace.settings.customMode,
        }
      : null;

  return (
    <>
      <ThemeBoot theme={workspace.settings.theme} custom={custom} />
      <ToastProvider>
        <WorkspaceProvider initial={workspace}>
          <AppShell userName={user.name} userEmail={user.email}>{children}</AppShell>
        </WorkspaceProvider>
      </ToastProvider>
    </>
  );
}
