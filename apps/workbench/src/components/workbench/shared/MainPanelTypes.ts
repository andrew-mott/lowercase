export type MainPanelLanguage = "json" | "markdown" | "plaintext";

export type OpenInMainPanel = (
  title: string,
  value: string,
  language: MainPanelLanguage,
) => void;
