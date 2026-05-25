export const DEFAULT_LOCALE = "en" as const;

export const SUPPORTED_LOCALES = ["en", "ar", "es", "fr", "it", "nl", "ko", "pt-BR", "zh-CN", "zh-TW"] as const;

export const LANGUAGE_METADATA = {
	en: {
		name: "English",
		nativeName: "English",
		dir: "ltr",
	},
	ar: {
		name: "العربية",
		nativeName: "العربية",
		dir: "rtl",
	},
	es: {
		name: "Spanish",
		nativeName: "Español",
		dir: "ltr",
	},
	fr: {
		name: "French",
		nativeName: "Français",
		dir: "ltr",
	},
	it: {
		name: "Italian",
		nativeName: "Italiano",
		dir: "ltr",
	},
	nl: {
		name: "Dutch",
		nativeName: "Nederlands",
		dir: "ltr",
	},
	ko: {
		name: "Korean",
		nativeName: "한국어",
		dir: "ltr",
	},
	"pt-BR": {
		name: "Portuguese",
		nativeName: "Português",
		dir: "ltr",
	},
	"zh-CN": {
		name: "Simplified Chinese",
		nativeName: "簡體中文",
		dir: "ltr",
	},
	"zh-TW": {
		name: "Traditional Chinese",
		nativeName: "繁體中文",
		dir: "ltr",
	},
} as const satisfies Record<(typeof SUPPORTED_LOCALES)[number], { name: string; nativeName: string; dir: "ltr" | "rtl" }>;

export const I18N_NAMESPACES = [
	"common",
	"launch",
	"editor",
	"timeline",
	"settings",
	"dialogs",
	"shortcuts",
	"extensions",
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];
export type LocaleDirection = (typeof LANGUAGE_METADATA)[AppLocale]["dir"];
