const lightText = "!text-slate-100";
const mutedText = "!text-slate-300";
const subtleText = "!text-slate-400";
const darkSurface = "!bg-[#101522]";
const darkElevatedSurface = "!bg-[#151b2a]";

export const signalGenClerkAppearance = {
  variables: {
    colorPrimary: "#22d3ee",
    colorBackground: "#101522",
    colorInputBackground: "#f8fafc",
    colorInputText: "#0f172a",
    colorText: "#f8fafc",
    colorTextOnPrimaryBackground: "#06131a",
    colorTextSecondary: "#cbd5e1",
    colorNeutral: "#94a3b8",
    colorDanger: "#fb7185",
    borderRadius: "1rem",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  elements: {
    modalBackdrop: "!bg-black/75 backdrop-blur-sm",
    card: `${darkSurface} !border !border-white/10 !shadow-2xl !shadow-black/50`,
    headerTitle: lightText,
    headerSubtitle: mutedText,
    socialButtonsBlockButton: "!border-white/10 !bg-white/[0.04] hover:!bg-white/[0.08]",
    socialButtonsBlockButtonText: lightText,
    dividerLine: "!bg-white/10",
    dividerText: subtleText,
    formFieldLabel: mutedText,
    formFieldInput: "!border-white/10 !bg-white !text-slate-950 placeholder:!text-slate-500 focus:!ring-2 focus:!ring-cyan-300/40",
    formButtonPrimary: "!bg-cyan-300 !text-slate-950 hover:!bg-cyan-200",
    footer: `${darkElevatedSurface} !border-white/10`,
    footerActionText: mutedText,
    footerActionLink: "!text-cyan-200 hover:!text-cyan-100",
    footerPagesLink: subtleText,
    modalCloseButton: "!text-slate-300 hover:!text-white",
    organizationSwitcherTrigger:
      "!h-10 !rounded-full !border !border-white/10 !bg-white/[0.04] !px-3 !text-slate-100 hover:!bg-white/[0.08] focus:!shadow-none",
    organizationSwitcherTriggerIcon: "!text-slate-300",
    organizationPreview: "!gap-2",
    organizationPreviewAvatarBox: "!h-7 !w-7 !rounded-lg",
    organizationPreviewMainIdentifier: lightText,
    organizationPreviewSecondaryIdentifier: subtleText,
    organizationSwitcherPopoverCard: `${darkSurface} !border !border-white/10 !text-slate-100 !shadow-2xl !shadow-black/40`,
    organizationSwitcherPopoverActionButton: "hover:!bg-white/[0.06]",
    organizationSwitcherPopoverActionButtonText: lightText,
    organizationSwitcherPopoverActionButtonIcon: "!text-slate-300",
    organizationSwitcherPopoverFooter: "!border-white/10",
    userButtonAvatarBox: "!h-10 !w-10",
    userButtonPopoverCard: `${darkSurface} !border !border-white/10 !text-slate-100 !shadow-2xl !shadow-black/40`,
    userButtonPopoverActionButton: "hover:!bg-white/[0.06]",
    userButtonPopoverActionButtonText: lightText,
    userButtonPopoverActionButtonIcon: "!text-slate-300",
    userPreviewMainIdentifier: lightText,
    userPreviewSecondaryIdentifier: subtleText,
  },
} as const;
