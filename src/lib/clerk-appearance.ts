/**
 * Clerk `appearance` for the sign-in and sign-up cards, so they read as part
 * of CookSnap rather than a dropped-in widget. Class strings only — the app's
 * own Tailwind tokens (`bg-card`, `border-border`, `bg-primary`, `font-sans`),
 * which already follow the light/dark theme, so nothing here needs a second
 * dark-mode definition.
 */
export const authAppearance = {
  elements: {
    rootBox: "w-full max-w-sm font-sans",
    cardBox: "w-full rounded-lg border border-border shadow-sm",
    card: "bg-card text-card-foreground font-sans",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButton: "border-border text-foreground hover:bg-accent",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    formFieldLabel: "text-foreground",
    formFieldInput: "rounded-md border-border bg-background text-foreground",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
    formButtonPrimary: "rounded-lg bg-primary text-primary-foreground font-medium normal-case shadow-none hover:bg-primary/90",
    formResendCodeLink: "text-primary hover:text-primary/90",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    footer: "bg-card",
    footerActionText: "text-muted-foreground",
    footerActionLink: "text-primary hover:text-primary/90",
  },
};
