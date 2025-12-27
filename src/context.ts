import { App } from "obsidian";
import * as React from "react";

export const AppContext = React.createContext<App | undefined>(undefined);
export const EventTargetContext = React.createContext<EventTarget | undefined>(undefined);

export function useApp(): App {
	const app = React.useContext(AppContext);
	if (!app) throw new Error("useApp must be used within AppContext.Provider");
	return app;
}
