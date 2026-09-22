import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark";
type Locale = "en" | "ar";

interface PreferencesContextValue {
  theme: Theme;
  locale: Locale;
  direction: "ltr" | "rtl";
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleTheme: () => void;
  t: (key: string) => string;
}

const THEME_KEY = "caretrack-theme";
const LOCALE_KEY = "caretrack-locale";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    "app.name": "CareTrack",
    "app.tagline": "Health companion",
    "navigation.main": "Main navigation",
    "navigation.toggle": "Toggle navigation",
    "navigation.dashboard": "Dashboard",
    "navigation.medications": "Medications",
    "navigation.appointments": "Appointments",
    "navigation.history": "History",
    "navigation.reports": "Reports",
    "navigation.emergency": "I feel unwell",
    "navigation.measurements": "Measurements",
    "navigation.health": "Health & alerts",
    "navigation.goals": "Health goals",
    "navigation.wearables": "Wearables",
    "navigation.checkIns": "Check-ins",
    "navigation.symptoms": "Symptoms",
    "navigation.documents": "Documents",
    "navigation.profile": "Profile",
    "navigation.notifications": "Notifications",
    "navigation.security": "Security",
    "navigation.privacy": "Privacy",
    "navigation.more": "More",
    "navigation.logout": "Log out",
    "preferences.language": "Language",
    "preferences.theme": "Theme",
    "preferences.english": "English",
    "preferences.arabic": "Arabic",
    "preferences.light": "Light",
    "preferences.dark": "Dark",
    "session.checkingTitle": "Checking your session",
    "session.checkingDescription":
      "Please wait while we securely load your account.",
    "session.errorTitle": "Session check failed",
    "session.errorFallback":
      "We could not verify your session. Please try again.",
    "session.tryAgain": "Try again",
    "session.returnToLogin": "Return to login",
  },
  ar: {
    "app.name": "كير تراك",
    "app.tagline": "رفيقك الصحي",
    "navigation.main": "التنقل الرئيسي",
    "navigation.toggle": "فتح أو إغلاق التنقل",
    "navigation.dashboard": "لوحة التحكم",
    "navigation.medications": "الأدوية",
    "navigation.appointments": "المواعيد",
    "navigation.history": "السجل",
    "navigation.reports": "التقارير",
    "navigation.emergency": "أشعر بتوعك",
    "navigation.measurements": "القياسات",
    "navigation.health": "الصحة والتنبيهات",
    "navigation.goals": "الأهداف الصحية",
    "navigation.wearables": "الأجهزة القابلة للارتداء",
    "navigation.checkIns": "المتابعات اليومية",
    "navigation.symptoms": "الأعراض",
    "navigation.documents": "المستندات",
    "navigation.profile": "الملف الشخصي",
    "navigation.notifications": "الإشعارات",
    "navigation.security": "الأمان",
    "navigation.privacy": "الخصوصية",
    "navigation.more": "المزيد",
    "navigation.logout": "تسجيل الخروج",
    "preferences.language": "اللغة",
    "preferences.theme": "المظهر",
    "preferences.english": "الإنجليزية",
    "preferences.arabic": "العربية",
    "preferences.light": "فاتح",
    "preferences.dark": "داكن",
    "session.checkingTitle": "جار التحقق من الجلسة",
    "session.checkingDescription": "يرجى الانتظار أثناء تحميل حسابك بأمان.",
    "session.errorTitle": "فشل التحقق من الجلسة",
    "session.errorFallback": "تعذر التحقق من الجلسة. يرجى المحاولة مرة أخرى.",
    "session.tryAgain": "حاول مرة أخرى",
    "session.returnToLogin": "العودة إلى تسجيل الدخول",
  },
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readStoredTheme(): Theme {
  if (localStorage.getItem(THEME_KEY) === "dark") return "dark";
  if (localStorage.getItem(THEME_KEY) === "light") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredLocale(): Locale {
  return localStorage.getItem(LOCALE_KEY) === "ar" ? "ar" : "en";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const direction = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    localStorage.setItem(LOCALE_KEY, locale);
  }, [direction, locale]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      theme,
      locale,
      direction,
      setTheme: setThemeState,
      setLocale: setLocaleState,
      toggleTheme: () =>
        setThemeState((current) => (current === "dark" ? "light" : "dark")),
      t: (key) => messages[locale][key] ?? messages.en[key] ?? key,
    }),
    [direction, locale, theme],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}
