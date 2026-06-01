const inkText = "!text-[#3A2A30]";
const mutedText = "!text-[#94787F]";
const subtleText = "!text-[#B6A2A8]";
const cardSurface = "!bg-[#FFFFFF]";
const softSurface = "!bg-[#FBF4EF]";

export const signalGenClerkAppearance = {
  variables: {
    colorPrimary: "#7A3B4E",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#F7ECE5",
    colorInputText: "#3A2A30",
    colorText: "#3A2A30",
    colorTextOnPrimaryBackground: "#FFF6F1",
    colorTextSecondary: "#94787F",
    colorNeutral: "#B6A2A8",
    colorDanger: "#AF5A52",
    borderRadius: "1rem",
    fontFamily:
      "Hanken Grotesk, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  elements: {
    modalBackdrop: "!bg-[#3A2A30]/35 backdrop-blur-sm",
    card: `${cardSurface} !border !border-[#F0E1DB] !text-[#3A2A30] !shadow-[0_18px_44px_rgba(122,59,78,0.14)]`,
    headerTitle: inkText,
    headerSubtitle: mutedText,
    socialButtonsBlockButton: "!border-[#F0E1DB] !bg-[#FBF4EF] hover:!bg-[#F3DCE2]",
    socialButtonsBlockButtonText: inkText,
    dividerLine: "!bg-[#F0E1DB]",
    dividerText: subtleText,
    formFieldLabel: mutedText,
    formFieldInput:
      "!rounded-2xl !border-[#F0E1DB] !bg-[#F7ECE5] !text-[#3A2A30] placeholder:!text-[#B6A2A8] focus:!border-[#C77E92] focus:!ring-4 focus:!ring-[#F3DCE2]",
    formButtonPrimary: "!bg-[#7A3B4E] !text-[#FFF6F1] hover:!bg-[#682F41]",
    footer: `${softSurface} !border-[#F0E1DB]`,
    footerActionText: mutedText,
    footerActionLink: "!text-[#B96A80] hover:!text-[#7A3B4E]",
    footerPagesLink: subtleText,
    modalCloseButton: "!text-[#94787F] hover:!text-[#3A2A30]",
    organizationSwitcherTrigger:
      "!h-10 !rounded-full !border !border-[#F0E1DB] !bg-[#FFFFFF] !px-3 !text-[#3A2A30] !shadow-[0_1px_2px_rgba(122,59,78,0.06)] hover:!bg-[#FAEDE9] focus:!shadow-none",
    organizationSwitcherTriggerIcon: "!text-[#B6A2A8]",
    organizationPreview: "!gap-2",
    organizationPreviewAvatarBox: "!h-7 !w-7 !rounded-lg",
    organizationPreviewMainIdentifier: inkText,
    organizationPreviewSecondaryIdentifier: subtleText,
    organizationSwitcherPopoverCard: `${cardSurface} !border !border-[#F0E1DB] !text-[#3A2A30] !shadow-[0_18px_44px_rgba(122,59,78,0.14)]`,
    organizationSwitcherPopoverActionButton: "hover:!bg-[#FAEDE9]",
    organizationSwitcherPopoverActionButtonText: inkText,
    organizationSwitcherPopoverActionButtonIcon: "!text-[#94787F]",
    organizationSwitcherPopoverFooter: "!border-[#F0E1DB]",
    userButtonAvatarBox: "!h-10 !w-10",
    userButtonPopoverCard: `${cardSurface} !border !border-[#F0E1DB] !text-[#3A2A30] !shadow-[0_18px_44px_rgba(122,59,78,0.14)]`,
    userButtonPopoverActionButton: "hover:!bg-[#FAEDE9]",
    userButtonPopoverActionButtonText: inkText,
    userButtonPopoverActionButtonIcon: "!text-[#94787F]",
    userPreviewMainIdentifier: inkText,
    userPreviewSecondaryIdentifier: subtleText,
  },
} as const;
