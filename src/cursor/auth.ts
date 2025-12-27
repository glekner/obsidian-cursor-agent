import { CursorAgentSettings } from "../types";
import { execCursorAgent } from "./cli";

export interface AuthResult {
	isAuthenticated: boolean;
	source: "login" | "api-key" | "env" | "none";
	args: string[];
}

/**
 * Checks if cursor-agent is logged in by running a quick test command.
 * Returns auth args to use when spawning cursor-agent.
 */
export async function getAuthConfig(
	settings: CursorAgentSettings,
	cwd: string
): Promise<AuthResult> {
	const envApiKey = process.env.CURSOR_API_KEY?.trim();
	if (envApiKey) {
		return {
			isAuthenticated: true,
			source: "env",
			args: [],
		};
	}

	// First, check if CLI is logged in
	const isLoggedIn = await checkCursorLogin(settings, cwd);

	if (isLoggedIn) {
		return {
			isAuthenticated: true,
			source: "login",
			args: [],
		};
	}

	// Fallback to API key from settings
	if (settings.apiKey?.trim()) {
		return {
			isAuthenticated: true,
			source: "api-key",
			args: ["--api-key", settings.apiKey],
		};
	}

	return {
		isAuthenticated: false,
		source: "none",
		args: [],
	};
}

/**
 * Checks if cursor-agent is installed and accessible.
 */
export async function isCursorAgentInstalled(
	settings: CursorAgentSettings,
	cwd: string
): Promise<boolean> {
	const res = await execCursorAgent(["--version"], {
		cwd,
		settings,
		timeoutMs: 5000,
	});
	return res.code === 0;
}

/**
 * Checks if user is logged in via cursor-agent CLI.
 * Runs `cursor-agent` with a minimal prompt and checks if it fails due to auth.
 */
async function checkCursorLogin(
	settings: CursorAgentSettings,
	cwd: string
): Promise<boolean> {
	console.log("[cursor-agent] Checking login status...");
	const res = await execCursorAgent(["status"], {
		cwd,
		settings,
		timeoutMs: 5000,
	});
	console.log("[cursor-agent] Login check result:", res.code, res.stdout.slice(0, 100));
	if (res.code !== 0) return false;

	const out = `${res.stdout}\n${res.stderr}`.toLowerCase();
	if (out.includes("not logged")) return false;
	if (out.includes("logged in")) return true;
	if (out.includes("authenticated")) return true;

	// Best-effort: status succeeded and didn't say "not logged in"
	return true;
}

/**
 * Opens cursor-agent login flow (interactive).
 */
export async function openLoginFlow(
	settings: CursorAgentSettings,
	cwd: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	const res = await execCursorAgent(["login"], {
		cwd,
		settings,
		timeoutMs: 60_000,
	});
	return { code: res.code, stdout: res.stdout, stderr: res.stderr };
}
