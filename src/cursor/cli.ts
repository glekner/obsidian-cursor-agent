import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import type { CursorAgentSettings } from "../types";

type ProcessEnv = Record<string, string | undefined>;

export interface CursorAgentExecResult {
	code: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function getPathKey(env: ProcessEnv): string {
	// Windows commonly uses "Path" (case varies). Node preserves original keys.
	const existing = Object.keys(env).find((k) => k.toLowerCase() === "path");
	return existing ?? "PATH";
}

function getPathDelimiter(): string {
	return process.platform === "win32" ? ";" : ":";
}

function splitPath(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(getPathDelimiter())
		.map((p) => p.trim())
		.filter(Boolean);
}

function uniq(items: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of items) {
		if (seen.has(item)) continue;
		seen.add(item);
		out.push(item);
	}
	return out;
}

function getDefaultPathAdditions(): string[] {
	if (process.platform === "win32") return [];
	const home = process.env.HOME?.trim();
	const additions: string[] = [];
	if (home) {
		additions.push(`${home}/.local/bin`, `${home}/bin`);
	}
	// Common macOS/Homebrew paths
	additions.push("/opt/homebrew/bin", "/usr/local/bin");
	return additions;
}

export function buildCursorAgentEnv(
	_settings: CursorAgentSettings
): ProcessEnv {
	const env: ProcessEnv = { ...process.env };
	const pathKey = getPathKey(env);
	const existingPath = splitPath(env[pathKey]);
	const merged = uniq([...getDefaultPathAdditions(), ...existingPath]);
	env[pathKey] = merged.join(getPathDelimiter());
	return env;
}

export function getCursorAgentCommandCandidates(
	settings: CursorAgentSettings
): string[] {
	const configured = settings.cursorAgentPath?.trim();
	if (configured) return [configured];

	if (process.platform === "win32") {
		return [
			"cursor-agent.cmd",
			"cursor-agent.exe",
			"cursor-agent.bat",
			"cursor-agent",
		];
	}

	return ["cursor-agent"];
}

async function spawnOnce(
	command: string,
	args: string[],
	cwd: string,
	settings: CursorAgentSettings
): Promise<ChildProcessWithoutNullStreams> {
	const env = buildCursorAgentEnv(settings);
	const proc = spawn(command, args, {
		cwd,
		env,
		shell: false,
		windowsHide: true,
		stdio: ["pipe", "pipe", "pipe"],
	});

	return await new Promise((resolve, reject) => {
		const onSpawn = () => {
			cleanup();
			resolve(proc);
		};
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const cleanup = () => {
			proc.off("spawn", onSpawn);
			proc.off("error", onError);
		};
		proc.once("spawn", onSpawn);
		proc.once("error", onError);
	});
}

export async function spawnCursorAgentPiped(
	args: string[],
	options: { cwd: string; settings: CursorAgentSettings }
): Promise<ChildProcessWithoutNullStreams> {
	let lastErr: unknown;
	for (const cmd of getCursorAgentCommandCandidates(options.settings)) {
		try {
			return await spawnOnce(cmd, args, options.cwd, options.settings);
		} catch (err) {
			lastErr = err;
			const code = (err as { code?: string } | undefined)?.code;
			if (code === "ENOENT") continue;
			throw err instanceof Error ? err : new Error(String(err));
		}
	}
	if (lastErr instanceof Error) throw lastErr;
	throw new Error(
		`Unable to spawn cursor-agent. Configure an absolute path in settings or add it to PATH.`
	);
}

export async function execCursorAgent(
	args: string[],
	options: { cwd: string; settings: CursorAgentSettings; timeoutMs?: number }
): Promise<CursorAgentExecResult> {
	console.log("[cursor-agent] execCursorAgent:", args);
	const proc = await spawnCursorAgentPiped(args, {
		cwd: options.cwd,
		settings: options.settings,
	});

	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	let stdout = "";
	let stderr = "";

	proc.stdout.on("data", (d: Buffer) => {
		stdout += d.toString();
	});
	proc.stderr.on("data", (d: Buffer) => {
		stderr += d.toString();
	});

	return await new Promise((resolve) => {
		let settled = false;
		const settle = (result: CursorAgentExecResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};

		const timer = setTimeout(() => {
			console.log("[cursor-agent] exec timed out, stdout:", stdout.slice(0, 200));
			try {
				proc.kill();
			} catch {
				// ignore
			}
			settle({
				code: null,
				signal: "SIGTERM",
				stdout,
				stderr: stderr || `Timed out after ${timeoutMs}ms`,
			});
		}, timeoutMs);

		proc.on("close", (code, signal) => {
			console.log("[cursor-agent] exec closed, code:", code);
			settle({ code, signal, stdout, stderr });
		});
	});
}
