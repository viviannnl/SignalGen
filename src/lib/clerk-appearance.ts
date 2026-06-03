const primaryText = "!text-[var(--ink)]";
const mutedText = "!text-[var(--ink-soft)]";
const subtleText = "!text-[var(--ink-faint)]";
const panelSurface = "!bg-[var(--panel)]";
const elevatedSurface = "!bg-[var(--panel-2)]";

export const signalGenClerkAppearance = {
  variables: {
    colorPrimary: "#F2622E",
    colorBackground: "#F5E9E1",
    colorInputBackground: "#F4E6DD",
    colorInputText: "#2A1318",
    colorText: "#2A1318",
    colorTextOnPrimaryBackground: "#1a0a08",
    colorTextSecondary: "#7B5A60",
    colorNeutral: "#A98A8F",
    colorDanger: "#C0463C",
    borderRadius: "1rem",
    fontFamily: "var(--sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  elements: {
    modalBackdrop: "!bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] backdrop-blur-sm",
    card: `${panelSurface} !border !border-[var(--line)] !shadow-[var(--shadow-pop)]`,
    headerTitle: primaryText,
    headerSubtitle: mutedText,
    socialButtonsBlockButton: "!border-[var(--line-2)] !bg-[var(--panel-2)] hover:!bg-[var(--panel-3)]",
    socialButtonsBlockButtonText: primaryText,
    dividerLine: "!bg-[var(--line)]",
    dividerText: subtleText,
    formFieldLabel: mutedText,
    formFieldInput: "!border-[var(--line-2)] !bg-[var(--inset)] !text-[var(--ink)] placeholder:!text-[var(--ink-faint)] focus:!ring-2 focus:!ring-[var(--signal-soft)]",
    formButtonPrimary: "!bg-[var(--rose)] !text-[var(--rose-ink)] hover:!bg-[var(--rose-strong)]",
    footer: `${elevatedSurface} !border-[var(--line)]`,
    footerActionText: mutedText,
    footerActionLink: "!text-[var(--signal)] hover:!text-[var(--rose-strong)]",
    footerPagesLink: subtleText,
    modalCloseButton: "!text-[var(--ink-faint)] hover:!text-[var(--ink)]",
    organizationSwitcherTrigger:
      "!h-10 !rounded-full !border !border-[var(--line)] !bg-[var(--panel-2)] !px-3 !text-[var(--ink)] hover:!bg-[var(--panel-3)] focus:!shadow-none",
    organizationSwitcherTriggerIcon: "!text-[var(--ink-faint)]",
    organizationPreview: "!gap-2",
    organizationPreviewAvatarBox: "!h-7 !w-7 !rounded-lg",
    organizationPreviewMainIdentifier: primaryText,
    organizationPreviewSecondaryIdentifier: subtleText,
    organizationSwitcherPopoverCard: `${panelSurface} !border !border-[var(--line)] !text-[var(--ink)] !shadow-[var(--shadow-pop)]`,
    organizationSwitcherPopoverActionButton: "hover:!bg-[var(--panel-3)]",
    organizationSwitcherPopoverActionButtonText: primaryText,
    organizationSwitcherPopoverActionButtonIcon: "!text-[var(--ink-faint)]",
    organizationSwitcherPopoverFooter: "!border-[var(--line)]",
    userButtonAvatarBox: "!h-10 !w-10",
    userButtonPopoverCard: `${panelSurface} !border !border-[var(--line)] !text-[var(--ink)] !shadow-[var(--shadow-pop)]`,
    userButtonPopoverActionButton: "hover:!bg-[var(--panel-3)]",
    userButtonPopoverActionButtonText: primaryText,
    userButtonPopoverActionButtonIcon: "!text-[var(--ink-faint)]",
    userPreviewMainIdentifier: primaryText,
    userPreviewSecondaryIdentifier: subtleText,
  },
} as const;
