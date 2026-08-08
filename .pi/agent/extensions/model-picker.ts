/**
 * model-picker.ts
 *
 * Alt+M: open a fuzzy-search model picker as an in-TUI overlay. Works mid-prompt
 * (the editor draft is preserved; focus moves to the overlay and back).
 *
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
import type { ExtensionAPI, ExtensionContext, Model } from "@earendil-works/pi-coding-agent";

// Minimal theme shape — the interactive mode passes its full theme into the
// factory; we only need `fg(name, text)`.
type ThemeLike = { fg: (name: string, text: string) => string };

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("alt+m", {
		description: "Switch model (fuzzy search; keeps your prompt)",
		handler: (ctx) => openModelPicker(pi, ctx),
	});
}

async function openModelPicker(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui" || !ctx.hasUI) {
		ctx.ui.notify("Alt+M requires interactive mode", "warning");
		return;
	}

	let models: Model[];
	try {
		ctx.modelRegistry.refresh();
		models = ctx.modelRegistry.getAvailable();
	} catch {
		models = [];
	}
	if (models.length === 0) {
		ctx.ui.notify("No models available. Add a provider with /add-provider or /login first.", "warning");
		return;
	}

	// overlay: true → the component is shown on top of the chat; the editor's
	// draft text is kept in memory and focus is restored to the editor when the
	// overlay closes. The TUI does a diff render on close — no chat re-read.
	const model = await ctx.ui
		.custom<Model | undefined>(
			(tui, theme, keybindings, done) =>
				new ModelPickerOverlay(models, theme, keybindings, done),
			{ overlay: true },
		)
		.catch((err) => {
			ctx.ui.notify(
				`Model picker error: ${err instanceof Error ? err.message : String(err)}`,
				"error",
			);
			return undefined;
		});

	if (!model) return; // cancelled — leave the chat and editor untouched
	const ok = await pi.setModel(model);
	if (ok) ctx.ui.notify(`Model: ${model.id}`, "info");
	else ctx.ui.notify(`Could not switch to ${model.id}`, "error");
}

/** `provider/model  display-name` (display name suppressed when it equals the id). */
function lineOf(m: Model): string {
	const base = `${m.provider}/${m.id}`;
	const name = m.name && m.name !== m.id ? m.name : "";
	return name ? `${base}  ${name}` : base;
}

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 10;

class ModelPickerOverlay extends Container implements Focusable {
	private models: Model[];
	private theme: ThemeLike;
	private done: (m: Model | undefined) => void;
	private searchInput: Input;
	private titleText: Text;
	private listContainer: Container;
	private hintText: Text;
	private content: Container;
	private color: (s: string) => string;
	private filtered: Model[];
	private selectedIndex = 0;
	private _focused = false;

	constructor(
		models: Model[],
		theme: ThemeLike,
		private keybindings: KeybindingsManager,
		done: (m: Model | undefined) => void,
	) {
		super();
		this.models = models;
		this.theme = theme;
		this.done = done;
		this.color = (s) => theme.fg("border", s);
		this.filtered = models;

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

		this.titleText.setText(this.theme.fg("muted", "  Select model — type to filter"));
		this.hintText.setText(this.theme.fg("muted", "  ↑↓ navigate · enter select · esc cancel"));

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
		// Match against provider + id + display name, so typing a provider
		// narrows to that provider's models.
		this.filtered = fuzzyFilter(this.models, query, (m) =>
			`${m.provider}/${m.id} ${m.name ?? ""}`.trim(),
		);
		if (this.selectedIndex >= this.filtered.length) {
			this.selectedIndex = Math.max(0, this.filtered.length - 1);
		}

		this.listContainer.clear();
		const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(MAX_VISIBLE / 2), this.filtered.length - MAX_VISIBLE));
		const end = Math.min(start + MAX_VISIBLE, this.filtered.length);
		for (let i = start; i < end; i++) {
			const m = this.filtered[i];
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? "▶ " : "  ";
			const line = `${prefix}${lineOf(m)}`;
			const text = isSelected ? this.theme.fg("accent", line) : line;
			this.listContainer.addChild(new Text(text, 0, 0));
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
			const m = this.filtered[this.selectedIndex];
			this.done(m); // undefined if no filtered results
			return;
		}
		if (kb.matches(data, "tui.select.cancel")) {
			this.done(undefined);
			return;
		}
		// Everything else (typing, backspace, word-jump, paste…) updates the
		// query, then we re-run the fuzzy filter.
		this.searchInput.handleInput(data);
		this.refreshList();
	}
}
