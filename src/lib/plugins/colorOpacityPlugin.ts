import plugin from "tailwindcss/plugin";

// Types
interface ColorValue {
	DEFAULT?: string;
	[key: string]: string | ColorValue | undefined;
}

type ColorProperty = "background-color" | "border-color" | "color";
type EscapeFunction = (className: string) => string;
type UtilitiesRecord = Record<string, Record<string, string>>;

// Color Utilities
const getColorMixValue = (color: string, opacity: number): string => {
	return `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
};

// Class Name Utilities
const getPropertyPrefix = (property: ColorProperty): string => {
	const prefixMap: Record<ColorProperty, string> = {
		"background-color": "bg",
		"border-color": "border",
		color: "text",
	};
	return prefixMap[property];
};

// Utility Generator
const generateUtility =
	(e: EscapeFunction) =>
	(property: ColorProperty, name: string, color: string, opacity: number) => {
		const prefix = getPropertyPrefix(property);
		const className = `${prefix}-${name}/${opacity}`;

		return {
			[`.${e(className)}`]: {
				[property]: getColorMixValue(color, opacity),
			},
		};
	};

// Color Processing
const generateAllUtilities =
	(e: EscapeFunction) =>
	(color: string, name: string, opacity: number): UtilitiesRecord => {
		const properties: ColorProperty[] = [
			"background-color",
			"border-color",
			"color",
		];
		const utilities = properties.map((property) =>
			generateUtility(e)(property, name, color, opacity)
		);

		return utilities.reduce((acc, u) => ({ ...acc, ...u }), {});
	};

const generateOpacityClasses =
	(e: EscapeFunction, opacityUtilities: UtilitiesRecord) =>
	(color: string, name: string) => {
		Array.from({ length: 10 }, (_, i) => (i + 1) * 10).forEach(
			(opacity) => {
				Object.assign(
					opacityUtilities,
					generateAllUtilities(e)(color, name, opacity)
				);
			}
		);
	};

const processColorObject =
	(e: EscapeFunction, opacityUtilities: UtilitiesRecord) =>
	(
		colorValue: string | ColorValue,
		baseName: string,
		parentPath: string[] = []
	) => {
		const currentPath = [...parentPath, baseName];

		if (typeof colorValue === "string") {
			if (colorValue.startsWith("var(--")) {
				if (colorValue.includes("-rgb")) {
					return;
				}
				const colorName = currentPath.join("-");
				generateOpacityClasses(e, opacityUtilities)(
					colorValue,
					colorName
				);
			}
		} else if (typeof colorValue === "object" && colorValue !== null) {
			Object.entries(colorValue).forEach(([key, value]) => {
				const nextBaseName = key === "DEFAULT" ? "" : key;
				const nextPath = nextBaseName
					? currentPath
					: currentPath.slice(0, -1);
				if (value) {
					processColorObject(e, opacityUtilities)(
						value,
						nextBaseName,
						nextPath
					);
				}
			});
		}
	};

/**
 * Tailwind plugin for adding color opacity support using color-mix
 * Supports deeply nested color objects and variants
 *
 * Examples:
 * bg-primary/20 -> .bg-primary\/20 { background-color: color-mix(in srgb, var(--interactive-accent) 20%, transparent); }
 * bg-modifier-error/50
 * text-background-modifier-success/30
 */
// eslint-disable-next-line @typescript-eslint/unbound-method -- e is a pure function
export const colorOpacityPlugin = plugin(function ({ addUtilities, theme, e }) {
	const opacityUtilities: UtilitiesRecord = {};
	const escape: EscapeFunction = (className) => e(className);

	// Process all color-related theme configs
	const processThemeColors = (themeKey: string, prefix?: string) => {
		const colors: Record<string, string | ColorValue> =
			theme(themeKey) ?? {};
		Object.entries(colors).forEach(([colorName, colorValue]) => {
			const baseName = prefix ? `${prefix}-${colorName}` : colorName;
			processColorObject(escape, opacityUtilities)(colorValue, baseName);
		});
	};

	// Process all color configs
	processThemeColors("textColor", "");
	processThemeColors("backgroundColor", "");
	processThemeColors("borderColor", "");
	processThemeColors("colors");

	addUtilities(opacityUtilities);
});
