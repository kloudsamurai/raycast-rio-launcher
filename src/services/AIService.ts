/**
 * AI service for intelligent command suggestions and error diagnosis
 */

import { AI, LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { IAIService, AISuggestion, AIModel } from "../types/services";
import { getEventBus } from "./EventBus";
import type { IRioAICommand, IRioError } from "../types/rio";
import { isDefined, getErrorMessage, getErrorCode } from "../utils/type-guards";

const SUGGESTIONS_CACHE_KEY = "rio-ai-suggestions-cache";
const MODEL_PREFERENCE_KEY = "rio-ai-model";
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const SECONDS_IN_MINUTE = 60;
const MS_IN_SECOND = 1000;
const CACHE_TTL = HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE * MS_IN_SECOND;
const DEFAULT_CONFIDENCE = 0.5;

type SuggestionCache = Record<
  string,
  {
    suggestions: AISuggestion[];
    timestamp: number;
  }
>;

export class AIService extends BaseService implements IAIService {
  private ai: AI | null = null;
  private model: AIModel = "gpt-3.5-turbo";
  private suggestionCache: SuggestionCache = {};
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private commandHistory: IRioAICommand[] = [];

  constructor(options?: IServiceOptions) {
    super("AIService", options);
  }

  protected async onInitialize(): Promise<void> {
    // Initialize AI if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.ai = new AI();
      this.log("info", "AI service initialized");
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("warn", "AI not available", error);
      } else {
        this.log("warn", "AI not available", new Error("Unknown error"));
      }
    }

    // Load model preference
    const savedModel = await LocalStorage.getItem<AIModel>(MODEL_PREFERENCE_KEY);
    if (savedModel !== undefined) {
      this.model = savedModel;
    }

    // Load suggestion cache
    await this.loadCache();

    // Set up event listeners
    this.setupEventListeners();
  }

  protected async onCleanup(): Promise<void> {
    // Save cache
    await this.saveCache();

    this.suggestionCache = {};
    this.commandHistory = [];
  }

  /**
   * Get command suggestions
   */
  async getSuggestions(context: string, limit?: number): Promise<AISuggestion[]> {
    if (this.ai === null) {
      return this.getFallbackSuggestions(context, limit);
    }

    // Check cache first
    const cacheKey = this.getCacheKey(context);
    const cached = this.suggestionCache[cacheKey];
    if (isDefined(cached) && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.suggestions.slice(0, limit);
    }

    try {
      // Build prompt
      const prompt = this.buildSuggestionsPrompt(context);

      // Get AI suggestions
      if (this.ai === null) {
        throw new Error("AI service not initialized");
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ai = this.ai;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const aiResponse: unknown = await ai.ask(prompt, {
        model: this.model,
        creativity: 0.3,
      });
      const response = String(aiResponse);

      // Parse suggestions
      const suggestions = this.parseSuggestions(response);

      // Cache results
      this.suggestionCache[cacheKey] = {
        suggestions,
        timestamp: Date.now(),
      };

      this.log("debug", `Generated ${suggestions.length} suggestions for context: ${context}`);

      return suggestions.slice(0, limit);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to get AI suggestions", error);
      } else {
        this.log("error", "Failed to get AI suggestions", new Error("Unknown error"));
      }
      return this.getFallbackSuggestions(context, limit);
    }
  }

  /**
   * Diagnose an error
   */
  async diagnoseError(error: IRioError): Promise<string> {
    if (this.ai === null) {
      return this.getFallbackDiagnosis(error);
    }

    try {
      // Build diagnosis prompt
      const prompt = this.buildDiagnosisPrompt(error);

      // Get AI diagnosis
      if (this.ai === null) {
        throw new Error("AI service not initialized");
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ai = this.ai;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const aiResponse: unknown = await ai.ask(prompt, {
        model: this.model,
        creativity: 0.2,
      });
      const response = String(aiResponse);

      this.log("debug", `Generated diagnosis for error: ${error instanceof Error ? error.message : "unknown error"}`);

      return response;
    } catch (aiError: unknown) {
      if (aiError instanceof Error) {
        this.log("error", "Failed to get AI diagnosis", aiError);
      } else {
        this.log("error", "Failed to get AI diagnosis", new Error("Unknown error"));
      }
      return this.getFallbackDiagnosis(error);
    }
  }

  /**
   * Generate command from natural language
   */
  async generateCommand(description: string): Promise<IRioAICommand | null> {
    if (this.ai === null) {
      return null;
    }

    try {
      // Build command generation prompt
      const prompt = this.buildCommandPrompt(description);

      // Get AI response
      if (this.ai === null) {
        throw new Error("AI service not initialized");
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ai = this.ai;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const aiResponse: unknown = await ai.ask(prompt, {
        model: this.model,
        creativity: 0.4,
      });
      const response = String(aiResponse);

      // Parse command
      const command: IRioAICommand | null = this.parseCommand(response);

      this.log("debug", `Generated command from description: ${description}`);

      return command;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to generate command", error);
      } else {
        this.log("error", "Failed to generate command", new Error("Unknown error"));
      }
      return null;
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<AIModel[]> {
    // In the future, this could query available models
    return ["gpt-3.5-turbo", "gpt-4"];
  }

  /**
   * Set the AI model
   */
  async setModel(model: AIModel): Promise<void> {
    this.model = model;
    await LocalStorage.setItem(MODEL_PREFERENCE_KEY, model);
    this.log("info", `AI model set to ${String(model)}`);
  }

  /**
   * Clear suggestion cache
   */
  async clearCache(): Promise<void> {
    this.suggestionCache = {};
    await LocalStorage.removeItem(SUGGESTIONS_CACHE_KEY);
    this.log("info", "AI suggestion cache cleared");
  }

  /**
   * Private helper methods
   */

  private buildSuggestionsPrompt(context: string): string {
    const RECENT_COMMANDS_COUNT = 5;
    const recentCommands = this.commandHistory.slice(-RECENT_COMMANDS_COUNT);

    return `
You are an AI assistant for the Rio terminal emulator. Based on the following context, suggest relevant terminal commands or Rio features.

Context: ${context}

Recent commands:
${recentCommands.map((cmd: IRioAICommand) => `- ${cmd.command} (in ${cmd.workingDirectory})`).join("\n")}

Provide up to 5 suggestions in the following JSON format:
{
  "suggestions": [
    {
      "command": "the command to run",
      "description": "brief description of what it does",
      "confidence": 0.9
    }
  ]
}

Focus on:
1. Commands relevant to the current context
2. Rio-specific features and shortcuts
3. Common developer workflows
4. Commands that follow from recent history
`;
  }

  private buildDiagnosisPrompt(error: IRioError): string {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = getErrorCode(error) ?? "N/A";
    let context: object = {};
    if ("context" in error && typeof error.context === "object") {
      context = error.context;
    }

    return `
You are an AI assistant for the Rio terminal emulator. Diagnose the following error and provide helpful guidance.

Error: ${message}
Code: ${typeof code === "string" ? code : String(code)}
Context: ${JSON.stringify(context, null, 2)}

Provide a diagnosis in the following format:
1. What likely caused this error
2. How to fix it (step by step if needed)
3. How to prevent it in the future

Keep the response concise and actionable.
`;
  }

  private buildCommandPrompt(description: string): string {
    return `
You are an AI assistant for the Rio terminal emulator. Generate a terminal command based on this description:

"${description}"

Consider:
- Common shell commands (bash/zsh)
- Git commands
- Package managers (npm, yarn, pip, cargo, etc.)
- Development tools
- File operations

Return the command in JSON format:
{
  "command": "the actual command",
  "description": "what it does",
  "warning": "any warnings or caveats (optional)"
}

If the description is unclear or dangerous, set command to null and explain why in the warning field.
`;
  }

  private parseSuggestions(response: string): AISuggestion[] {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(response) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "suggestions" in parsed &&
        Array.isArray(parsed.suggestions)
      ) {
        return parsed.suggestions.map((s: unknown) => {
          if (s !== null && typeof s === "object" && "command" in s && "description" in s) {
            const suggestion = s as Record<string, unknown>;
            return {
              command: typeof suggestion.command === "string" ? suggestion.command : "",
              description: typeof suggestion.description === "string" ? suggestion.description : "",
              confidence: typeof suggestion.confidence === "number" ? suggestion.confidence : DEFAULT_CONFIDENCE,
            };
          }
          return {
            command: "",
            description: "",
            confidence: DEFAULT_CONFIDENCE,
          };
        });
      }
    } catch {
      // Fallback to text parsing
      const lines = response.split("\n").filter((line: string) => line.trim() !== "");
      const MAX_SUGGESTIONS = 5;
      const FALLBACK_CONFIDENCE = 0.7;

      return lines
        .filter((line: string) => line.includes("-") || line.includes(":"))
        .slice(0, MAX_SUGGESTIONS)
        .map((line: string) => {
          const [command, ...descParts] = line.split(/[-:]/);
          return {
            command: command.trim(),
            description: descParts.join("-").trim(),
            confidence: FALLBACK_CONFIDENCE,
          };
        });
    }

    return [];
  }

  private parseCommand(response: string): IRioAICommand | null {
    try {
      const parsed = JSON.parse(response) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "command" in parsed &&
        typeof (parsed as Record<string, unknown>).command === "string"
      ) {
        const parsedObj = parsed as Record<string, unknown>;
        return {
          command: parsedObj.command as string,
          description: typeof parsedObj.description === "string" ? parsedObj.description : "",
          workingDirectory: "~/",
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // Try to extract command from text
      const commandMatch = /`([^`]+)`/.exec(response);
      if (commandMatch?.[1] !== undefined && commandMatch[1].length > 0) {
        return {
          command: commandMatch[1],
          description: "",
          workingDirectory: "~/",
          timestamp: new Date().toISOString(),
        };
      }
    }

    return null;
  }

  private getFallbackSuggestions(context: string, limit?: number): AISuggestion[] {
    // Provide basic suggestions based on context keywords
    const suggestions: AISuggestion[] = [];
    const ctx = context.toLowerCase();

    if (ctx.includes("git")) {
      suggestions.push(
        { command: "git status", description: "Show working tree status", confidence: 0.9 },
        { command: "git log --oneline", description: "Show commit history", confidence: 0.8 },
        { command: "git diff", description: "Show unstaged changes", confidence: 0.8 },
      );
    }

    if (ctx.includes("npm") || ctx.includes("node")) {
      suggestions.push(
        { command: "npm install", description: "Install dependencies", confidence: 0.9 },
        { command: "npm run dev", description: "Start development server", confidence: 0.8 },
        { command: "npm test", description: "Run tests", confidence: 0.8 },
      );
    }

    if (ctx.includes("docker")) {
      suggestions.push(
        { command: "docker ps", description: "List running containers", confidence: 0.9 },
        { command: "docker images", description: "List docker images", confidence: 0.8 },
        { command: "docker compose up", description: "Start services", confidence: 0.8 },
      );
    }

    // Add general suggestions
    if (suggestions.length === 0) {
      suggestions.push(
        { command: "ls -la", description: "List all files with details", confidence: 0.7 },
        { command: "pwd", description: "Show current directory", confidence: 0.7 },
        { command: "history", description: "Show command history", confidence: 0.6 },
      );
    }

    const DEFAULT_SUGGESTION_LIMIT = 5;
    return suggestions.slice(0, limit ?? DEFAULT_SUGGESTION_LIMIT);
  }

  private getFallbackDiagnosis(error: IRioError): string {
    const code = getErrorCode(error);
    const codeStr = typeof code === "string" ? code.toLowerCase() : "";
    const message = getErrorMessage(error).toLowerCase();

    return this.getDiagnosisForError(codeStr, message);
  }

  private getDiagnosisForError(codeStr: string, message: string): string {
    if (this.isFileNotFoundError(codeStr, message)) {
      return "The specified file or directory does not exist. Check the path and ensure the file exists.";
    }

    if (this.isPermissionError(codeStr, message)) {
      return "Permission denied. Try running with sudo or check file permissions.";
    }

    if (this.isNetworkError(message)) {
      return "Network connection issue. Check your internet connection and firewall settings.";
    }

    if (this.isSyntaxError(message)) {
      return "Syntax error in command or configuration. Check for typos or invalid syntax.";
    }

    return "An unexpected error occurred. Check the error message for details and ensure Rio is properly installed.";
  }

  private isFileNotFoundError(codeStr: string, message: string): boolean {
    return (codeStr.length > 0 && codeStr.includes("enoent")) || (message.length > 0 && message.includes("not found"));
  }

  private isPermissionError(codeStr: string, message: string): boolean {
    return (codeStr.length > 0 && codeStr.includes("eacces")) || (message.length > 0 && message.includes("permission"));
  }

  private isNetworkError(message: string): boolean {
    return message.length > 0 && (message.includes("connection") || message.includes("network"));
  }

  private isSyntaxError(message: string): boolean {
    return message.length > 0 && (message.includes("syntax") || message.includes("parse"));
  }

  private getCacheKey(context: string): string {
    return `suggestions:${context.toLowerCase().replace(/\s+/g, "_")}`;
  }

  private setupEventListeners(): void {
    // Track command execution for better suggestions
    this.eventBus.on("rio:command_executed", (event: unknown) => {
      (async (): Promise<void> => {
        if (typeof event === "object" && event !== null && "command" in event) {
          const typedEvent = event as { command: IRioAICommand };
          this.commandHistory.push(typedEvent.command);

          // Keep only recent history
          const MAX_HISTORY_SIZE = 100;
          const RECENT_HISTORY_SIZE = 50;
          if (this.commandHistory.length > MAX_HISTORY_SIZE) {
            this.commandHistory = this.commandHistory.slice(-RECENT_HISTORY_SIZE);
          }
        }
      })().catch((error: unknown) => {
        if (error instanceof Error) {
          this.log("error", "Error in command executed event handler", error);
        }
      });
    });

    // Clear cache on configuration changes
    this.eventBus.on("config:changed", () => {
      (async (): Promise<void> => {
        await this.clearCache();
      })().catch((error: unknown) => {
        if (error instanceof Error) {
          this.log("error", "Error clearing cache on config change", error);
        }
      });
    });
  }

  private async loadCache(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(SUGGESTIONS_CACHE_KEY);
      if (typeof stored === "string") {
        const parsedCache = JSON.parse(stored) as SuggestionCache;
        this.suggestionCache = parsedCache;

        // Clean expired entries
        const now = Date.now();
        const cacheKeys = Object.keys(this.suggestionCache);
        const freshCache: SuggestionCache = {};
        for (const key of cacheKeys) {
          if (now - this.suggestionCache[key].timestamp <= CACHE_TTL) {
            freshCache[key] = this.suggestionCache[key];
          }
        }
        this.suggestionCache = freshCache;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to load suggestion cache", error);
      } else {
        this.log("error", "Failed to load suggestion cache", new Error("Unknown error"));
      }
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await LocalStorage.setItem(SUGGESTIONS_CACHE_KEY, JSON.stringify(this.suggestionCache));
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to save suggestion cache", error);
      } else {
        this.log("error", "Failed to save suggestion cache", new Error("Unknown error"));
      }
    }
  }
}
