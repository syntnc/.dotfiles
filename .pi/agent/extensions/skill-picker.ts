/**
 * skill-picker.ts
 *
 * Alt+S: open a fuzzy-search skill picker as an in-TUI overlay. Works mid-prompt
 * (the editor draft is preserved; focus moves to the overlay and back).
 *
 * Shows skills WITHOUT the 'skill:' prefix, but selecting one
 * drops the full '/skill:name' command into the editor, ready to send.
 */
import {
	Container,
	fuzzyFilter,
	Input,
	Spacer,
	Text,
	type Component,
	type Focusable,
	type KeybindingsManager,
} from "@earendil-works/pi-tui";
import { matchesKey, Key } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext, SlashCommandInfo } from "@earendil-works/pi-coding-agent";

// Minimal theme shape — the interactive mode passes its full theme into the
// factory; we only need `fg(name, text)`.
type ThemeLike = { fg: (name: string, text: string) => string };

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("alt+s", {
		description: "Switch skill (fuzzy search; keeps your prompt)",
		handler: (ctx) => openSkillPicker(pi, ctx),
	});
}

async function openSkillPicker(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui" || !ctx.hasUI) {
		ctx.ui.notify("Alt+S requires interactive mode", "warning");
		return;
	}

	let skills: SlashCommandInfo[];
	try {
		skills = (pi.getCommands() as SlashCommandInfo[]).filter((c) => c.source === "skill");
	} catch {
		skills = [];
	}
	if (skills.length === 0) {
		ctx.ui.notify("No skills found", "info");
		return;
	}

	// overlay: true → the component is shown on top of the chat; the editor's
	// draft text is kept in memory and focus is restored to the editor when the
	// overlay closes. The TUI does a diff render on close — no chat re-read.
	const skill = await ctx.ui
		.custom<SlashCommandInfo | undefined>(
			(tui, theme, keybindings, done) =>
				new SkillPickerOverlay(skills, theme, keybindings, done),
			{ overlay: true },
		)
		.catch((err) => {
			ctx.ui.notify(
				`Skill picker error: ${err instanceof Error ? err.message : String(err)}`,
				"error",
			);
			return undefined;
		});

	if (!skill) return; // cancelled — leave the chat and editor untouched
	const cmd = "/skill:" + skill.name.replace(/^skill:/, "");
	const cur = (ctx.ui.getEditorText() ?? "").trimEnd();
	ctx.ui.setEditorText(cur.length ? `${cur}\n${cmd}` : cmd);
}

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 10;

class SkillPickerOverlay extends Container implements Focusable {
	private skills: SlashCommandInfo[];
	private theme: ThemeLike;
	private done: (s: SlashCommandInfo | undefined) => void;
	private searchInput: Input;
	private titleText: Text;
	private listContainer: Container;
	private hintText: Text;
	private content: Container;
	private color: (s: string) => string;
	private filtered: SlashCommandInfo[];
	private selectedIndex = 0;
	private showDesc = false;
	private _focused = false;

	constructor(
		skills: SlashCommandInfo[],
		theme: ThemeLike,
		private keybindings: KeybindingsManager,
		done: (s: SlashCommandInfo | undefined) => void,
	) {
		super();
		this.skills = skills;
		this.theme = theme;
		this.done = done;
		this.color = (s) => theme.fg("border", s);
		this.filtered = skills;

		this.searchInput = new Input();
		this.titleText = new Text("", 0, 0);
		this.listContainer = new Container();
		this.hintText = new Text("", 0, 0);
		this.content = new Container();

		// The children live inside `content`, which we frame in render() (a
		// leading/trailing spacer and left margin keep them off the border).
		const body: Component[] = [
			new Spacer(1),
			this.titleText,
			this.searchInput,
			new Spacer(1),
			this.listContainer,
			new Spacer(1),
			this.hintText,
			new Spacer(1),
		];
		for (const child of body) this.content.addChild(child);

		this.titleText.setText(this.theme.fg("muted", "  Select skill — type to filter"));
		this.hintText.setText(this.theme.fg("muted", "  ↑↓ navigate · enter select · tab desc · esc cancel"));

		this.refreshList();
	}

	get focused(): boolean {
		return this._focused;
	}
	set focused(v: boolean) {
		this._focused = v;
		// The Input is where the hardware cursor lives — propagate focus so the
		// TUI can position the cursor inside the query field.
		this.searchInput.focused = v;
	}

	override invalidate(): void {
		super.invalidate();
		this.content.invalidate();
	}

	override render(width: number): string[] {
		// The border occupies the left and right columns; the content renders in
		// the remaining `width - 2` columns. Cursor markers and ANSI codes pass
		// through untouched (the line is only padded and framed).
		//
		// Important: color each border cell individually. Wrapping the whole
		// row in one fg() call resets to default at the row end, so the inner
		// content's own color codes (which end in an ANSI reset) would leave the
		// trailing '│' in the default color — a mismatch against the leading '│'.
		const innerWidth = Math.max(1, width - 2);
		const inner = this.content.render(innerWidth);
		const out: string[] = [this.color("┌" + "─".repeat(innerWidth) + "┐")];
		const side = "│";
		for (const line of inner) {
			const body = (line ?? "").padEnd(innerWidth);
			out.push(this.color(side) + body + this.color(side));
		}
		out.push(this.color("└" + "─".repeat(innerWidth) + "┘"));
		return out;
	}

	private refreshList(): void {
		const query = this.searchInput.getValue();
		// Match against bare name + description
		this.filtered = fuzzyFilter(this.skills, query, (s) =>
			`${s.name.replace(/^skill:/, "")} ${s.description ?? ""}`.trim(),
		);
		if (this.selectedIndex >= this.filtered.length) {
			this.selectedIndex = Math.max(0, this.filtered.length - 1);
		}

		this.listContainer.clear();
		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(MAX_VISIBLE / 2),
				this.filtered.length - MAX_VISIBLE,
			),
		);
		const end = Math.min(start + MAX_VISIBLE, this.filtered.length);
		for (let i = start; i < end; i++) {
			const s = this.filtered[i];
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? "▶ " : "  ";
			const name = s.name.replace(/^skill:/, "");
			const line = `${prefix}${name}`;
			const text = isSelected ? this.theme.fg("accent", line) : line;
			this.listContainer.addChild(new Text(text, 0, 0));
			
			// Show description below selected item when toggled
			if (isSelected && this.showDesc && s.description) {
				const descText = this.theme.fg("muted", s.description);
				this.listContainer.addChild(new Text(descText, 4, 0));
			}
		}
		if (start > 0 || end < this.filtered.length) {
			this.listContainer.addChild(
				new Text(this.theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filtered.length})`), 0, 0),
			);
		} else if (this.filtered.length === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("muted", "  no matches"), 0, 0));
		}

		this.invalidate();
	}

	handleInput(data: string): void {
		const kb = this.keybindings;
		if (kb.matches(data, "tui.select.up")) {
			if (!this.filtered.length) return;
			this.selectedIndex =
				this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
			this.refreshList();
			return;
		}
		if (kb.matches(data, "tui.select.down")) {
			if (!this.filtered.length) return;
			this.selectedIndex =
				this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
			this.refreshList();
			return;
		}
		if (kb.matches(data, "tui.select.confirm")) {
			const s = this.filtered[this.selectedIndex];
			this.done(s); // undefined if no filtered results
			return;
		}
		if (kb.matches(data, "tui.select.cancel")) {
			this.done(undefined);
			return;
		}
		// Tab toggles description
		if (matchesKey(data, Key.tab)) {
			this.showDesc = !this.showDesc;
			this.refreshList();
			return;
		}
		// Everything else (typing, backspace, word-jump, paste…) updates the
		// query, then we re-run the fuzzy filter.
		this.searchInput.handleInput(data);
		this.refreshList();
	}
}
