import path from "path";

export function resolveWorkingDirectory(basePath: string, setting: string): string {
	const base = path.resolve(basePath);
	const trimmed = setting.trim();
	if (!trimmed) return base;

	const resolved = path.resolve(base, trimmed);
	const within = resolved === base || resolved.startsWith(base + path.sep);
	if (!within) {
		throw new Error("Working directory must be within the vault");
	}

	return resolved;
}


