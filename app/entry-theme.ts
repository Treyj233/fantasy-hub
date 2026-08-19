export const chargersClerkAppearance = {
  variables: {
    colorPrimary: "#0080c6",
    colorBackground: "#ffffff",
    colorText: "#001f47",
    colorTextSecondary: "#46647d",
    colorInputBackground: "#f4faff",
    colorInputText: "#000000",
    borderRadius: "0.8rem",
  },
  elements: {
    rootBox: { width: "min(100%, 460px)" },
    cardBox: { width: "100%", boxShadow: "0 26px 72px rgba(0, 17, 43, .48)" },
    card: { width: "100%", backgroundColor: "#ffffff", border: "2px solid rgba(255, 194, 14, .8)", boxShadow: "inset 0 1px 0 rgba(255, 255, 255, .9)" },
    headerTitle: { color: "#001f47", fontSize: "1.55rem", fontWeight: "900", letterSpacing: "-.025em" },
    headerSubtitle: { color: "#365a78", fontSize: ".94rem", lineHeight: "1.5" },
    socialButtonsBlockButton: { color: "#001f47", backgroundColor: "#f4faff", border: "1px solid #b9d9ee", fontWeight: "800" },
    socialButtonsBlockButtonText: { color: "#001f47", fontWeight: "800" },
    dividerLine: { backgroundColor: "#c8dce9" },
    dividerText: { color: "#46647d", fontSize: ".82rem", fontWeight: "700" },
    formFieldLabel: { color: "#001f47", fontSize: ".88rem", fontWeight: "850" },
    formFieldInput: { minHeight: "48px", color: "#000000", WebkitTextFillColor: "#000000", caretColor: "#000000", backgroundColor: "#f8fcff", border: "1.5px solid #9fc9e4", fontSize: "1rem", fontWeight: "650" },
    formButtonPrimary: { minHeight: "48px", color: "#001f47", background: "linear-gradient(135deg, #ffc20e, #ffd85a)", fontSize: ".95rem", fontWeight: "900", boxShadow: "0 8px 20px rgba(0, 128, 198, .22)" },
    footer: { background: "#eef8ff", borderTop: "1px solid #c7dfef" },
    footerActionText: { color: "#365a78", fontSize: ".88rem" },
    footerActionLink: { color: "#006daa", fontSize: ".88rem", fontWeight: "900" },
    formFieldErrorText: { color: "#a31525", fontSize: ".82rem", fontWeight: "750" },
    identityPreviewText: { color: "#001f47", fontWeight: "800" },
  },
};

export const nativeEmailOnlyClerkAppearance = {
  ...chargersClerkAppearance,
  elements: {
    ...chargersClerkAppearance.elements,
    socialButtonsBlockButton: {
      ...chargersClerkAppearance.elements.socialButtonsBlockButton,
      display: "none",
    },
    dividerRow: { display: "none" },
  },
};
