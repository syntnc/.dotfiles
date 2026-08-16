/**
 * custom-providers.ts
 *
 * Interactively add OpenAI-compatible custom providers:
 *
 *   /add-provider    - asks for provider name, base URL, and API key,
 *                      then fetches the /models endpoint and registers ALL
 *                      models automatically
 *   /list-providers  - show registered custom providers and their model counts
 *   /remove-provider - remove a custom provider
 *   /refresh-provider- re-fetch the model list for an existing provider
 *
 * Providers persist in ~/.pi/agent/custom-providers.json and are re-registered
 * on every startup, so they show up in /model, model cycling (Ctrl+P) and
 * `pi --list-models` without re-adding them.
 *
 * Notes:
 *   - The API key may be a literal value or an environment variable reference
 *     ($MY_API_KEY or ${MY_API_KEY}). Prefer the env var form so the key is
 *     not stored in plaintext.
 *   - All models are registered with extended thinking off by default. To
 *     enable reasoning (or tweak context window, costs, image input), edit
 *     ~/.pi/agent/custom-providers.json and restart or /reload.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORE_PATH = join(homedir(), ".pi", "agent", "custom-providers.json");

interface StoredModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

interface StoredProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: StoredModel[];
}

type Store = Record<string, StoredProvider>;

async function loadStore(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

async function saveStore(store: Store): Promise<void> {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a free-form provider name into an identifier like "my-llm". */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve a possibly-$ENV_VAR apiKey for outbound fetch calls. */
function resolveKey(key: string): string {
  if (key.startsWith("$$")) return key.slice(1);
  const env = process.env as Record<string, string | undefined>;
  return key
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, n: string) => env[n] ?? "")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, n: string) => env[n] ?? "");
}

interface FetchedModel {
  id: string;
  name?: string;
  context_window?: number;
  max_tokens?: number;
}

/** Fetch the OpenAI-compatible GET /models endpoint. */
async function fetchModels(baseUrl: string, apiKey: string): Promise<FetchedModel[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`GET ${base}/models returned ${res.status}: ${body}`);
    }
    const payload = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const data = Array.isArray(payload.data) ? payload.data : [];
    return data
      .filter((m) => typeof m?.id === "string" && (m.id as string).trim().length > 0)
      .map((m) => ({
        id: m.id as string,
        name: typeof m.name === "string" ? (m.name as string) : undefined,
        context_window: typeof m.context_window === "number" ? (m.context_window as number) : undefined,
        max_tokens: typeof m.max_tokens === "number" ? (m.max_tokens as number) : undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } finally {
    clearTimeout(timer);
  }
}

function toStoredModel(m: FetchedModel, reasoning: boolean): StoredModel {
  return {
    id: m.id,
    name: m.name ?? m.id,
    reasoning,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.context_window ?? 128000,
    maxTokens: m.max_tokens ?? 8192,
  };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  // Restore saved providers on startup. Calls made during the factory are
  // queued and applied before startup finishes, so models are available
  // immediately (including to `pi --list-models`).
  const store = await loadStore();
  for (const [id, p] of Object.entries(store)) {
    try {
      pi.registerProvider(id, {
        name: p.name,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        api: "openai-completions",
        models: p.models,
      });
    } catch (err) {
      console.error(`[custom-providers] failed to restore provider "${id}":`, err);
    }
  }

  // -------------------------------------------------------------------------
  // /add-provider
  // -------------------------------------------------------------------------
  pi.registerCommand("add-provider", {
    description: "Add an OpenAI-compatible provider (name, base URL, API key); registers all models from /models",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/add-provider needs an interactive session", "error");
        return;
      }

      const rawName = await ctx.ui.input("Provider name:", "e.g. my-llm");
      if (!rawName) return;
      const id = slugify(rawName);
      if (!id) {
        ctx.ui.notify("Invalid provider name", "error");
        return;
      }
      const displayName = rawName.trim();

      const baseUrl = (await ctx.ui.input("Base URL:", "https://api.example.com/v1"))?.trim();
      if (!baseUrl) return;

      const apiKey = (await ctx.ui.input("API key (or $ENV_VAR reference):", "$MY_API_KEY"))?.trim();
      if (!apiKey) return;

      ctx.ui.setStatus("custom-providers", `Fetching models from ${baseUrl}/models ...`);
      let models: FetchedModel[];
      try {
        models = await fetchModels(baseUrl, resolveKey(apiKey));
      } catch (err) {
        ctx.ui.setStatus("custom-providers", undefined);
        ctx.ui.notify(`Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`, "error");
        return;
      }
      ctx.ui.setStatus("custom-providers", undefined);

      if (models.length === 0) {
        ctx.ui.notify(`No models found at ${baseUrl}/models`, "error");
        return;
      }

      // Register every model automatically. Extended thinking defaults to off
      // for all of them; flip `reasoning` per model in
      // ~/.pi/agent/custom-providers.json if the provider has reasoning models.
      const stored: StoredModel[] = models.map((m) => toStoredModel(m, false));

      pi.registerProvider(id, {
        name: displayName,
        baseUrl,
        apiKey,
        api: "openai-completions",
        models: stored,
      });

      store[id] = { name: displayName, baseUrl, apiKey, models: stored };
      await saveStore(store);

      ctx.ui.notify(
        `Registered provider "${displayName}" with all ${stored.length} model(s). Use /model to pick one.`,
        "info",
      );

      // Offer to switch to one of the newly added models right away.
      if (stored.length > 0) {
        const switchNow = await ctx.ui.confirm("Switch to one of the new models now?", "Default: No");
        if (switchNow) {
          const target = await ctx.ui.select(
            "Switch to which model?",
            stored.map((m) => m.id),
          );
          if (target) {
            const model = ctx.modelRegistry.find(id, target);
            if (model) {
              const ok = await pi.setModel(model);
              if (!ok) ctx.ui.notify(`Could not switch to ${target} (no API key?)`, "error");
            }
          }
        }
      }
    },
  });

  // -------------------------------------------------------------------------
  // /list-providers
  // -------------------------------------------------------------------------
  pi.registerCommand("list-providers", {
    description: "List registered custom providers",
    handler: async (_args, ctx) => {
      const entries = Object.entries(store);
      if (entries.length === 0) {
        ctx.ui.notify("No custom providers registered. Use /add-provider.", "info");
        return;
      }
      const lines = entries.map(
        ([id, p]) => `${id} (${p.models.length} models) @ ${p.baseUrl}`,
      );
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // -------------------------------------------------------------------------
  // /remove-provider
  // -------------------------------------------------------------------------
  pi.registerCommand("remove-provider", {
    description: "Remove a custom provider",
    handler: async (_args, ctx) => {
      const entries = Object.entries(store);
      if (entries.length === 0) {
        ctx.ui.notify("No custom providers registered.", "info");
        return;
      }
      const choice = await ctx.ui.select(
        "Remove which provider?",
        entries.map(([id, p]) => `${id} (${p.models.length} models)`),
      );
      if (!choice) return;
      const id = choice.replace(/ \(\d+ models\)$/, "");
      pi.unregisterProvider(id);
      delete store[id];
      await saveStore(store);
      ctx.ui.notify(`Removed provider "${id}"`, "info");
    },
  });

  // -------------------------------------------------------------------------
  // /refresh-provider
  // -------------------------------------------------------------------------
  pi.registerCommand("refresh-provider", {
    description: "Re-fetch the model list for an existing custom provider",
    handler: async (_args, ctx) => {
      const entries = Object.entries(store);
      if (entries.length === 0) {
        ctx.ui.notify("No custom providers registered.", "info");
        return;
      }
      const choice = await ctx.ui.select(
        "Refresh which provider?",
        entries.map(([id, p]) => `${id} (${p.models.length} models)`),
      );
      if (!choice) return;
      const id = choice.replace(/ \(\d+ models\)$/, "");
      const provider = store[id];
      if (!provider) return;

      ctx.ui.setStatus("custom-providers", `Fetching models from ${provider.baseUrl}/models ...`);
      let models: FetchedModel[];
      try {
        models = await fetchModels(provider.baseUrl, resolveKey(provider.apiKey));
      } catch (err) {
        ctx.ui.setStatus("custom-providers", undefined);
        ctx.ui.notify(
          `Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
        return;
      }
      ctx.ui.setStatus("custom-providers", undefined);

      if (models.length === 0) {
        ctx.ui.notify(`No models found at ${provider.baseUrl}/models`, "error");
        return;
      }

      // Preserve reasoning flags for models that keep the same id.
      const previous = new Map(provider.models.map((m) => [m.id, m.reasoning]));
      const stored = models.map((m) => toStoredModel(m, previous.get(m.id) ?? false));

      pi.registerProvider(id, {
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        api: "openai-completions",
        models: stored,
      });
      provider.models = stored;
      await saveStore(store);
      ctx.ui.notify(`Refreshed provider "${id}": now ${stored.length} model(s).`, "info");
    },
  });
}
