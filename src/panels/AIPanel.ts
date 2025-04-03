/**
 * The main panel for the Assistant extension.
 * It manages:
 * - Creating and displaying the main assistant webview panel
 * - Handling communication between VS Code extension and webview
 * - Processing API requests to OpenAI
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as config from "../config";
import { Message, AIMessage, AIResponse } from "../types/chat";
import axios from "axios";

export class AIPanel {
  public static currentPanel: AIPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private static readonly _outputChannel =
    vscode.window.createOutputChannel("AI Assistant");
  private _messages: (Message | AIMessage)[] = [];

  private readonly _extensionPath: string;

  private get _apiKey(): string {
    return config.getApiKey();
  }

  private get _model(): string {
    return config.getModel();
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionPath = extensionUri.fsPath;
    AIPanel._outputChannel.appendLine("Initializing AI Assistant panel...");

    this._setupWebview(extensionUri);
  }

  private _setupWebview(extensionUri: vscode.Uri): void {
    if (!this._panel.webview) {
      throw new Error("Webview is not available");
    }

    this._panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    };

    this._panel.webview.html = this._getWebviewContent();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set up message handler for webview communication
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "askQuestion":
            await this._handleQuestion(message.text);
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  public static async createOrShow(extensionUri: vscode.Uri): Promise<AIPanel> {
    AIPanel._outputChannel.appendLine("Creating or showing AI panel...");

    const panel = vscode.window.createWebviewPanel(
      "aiAssistantPanel",
      "AI Assistant",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      },
    );

    AIPanel.currentPanel = new AIPanel(panel, extensionUri);
    AIPanel._outputChannel.appendLine("AI panel created and initialized");
    return AIPanel.currentPanel;
  }

  private _getWebviewContent(): string {
    try {
      const htmlPath = path.join(
        this._extensionPath,
        "out",
        "webview",
        "webview.html",
      );

      if (!fs.existsSync(htmlPath)) {
        throw new Error(`HTML file not found at: ${htmlPath}`);
      }

      return fs.readFileSync(htmlPath, "utf8");
    } catch (error) {
      const errorMessage = `Error loading webview content: ${error}`;
      AIPanel._outputChannel.appendLine(errorMessage);
      return `<html><body><h1>Error loading content</h1><p>${errorMessage}</p></body></html>`;
    }
  }

  public dispose(): void {
    AIPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
  private async _handleQuestion(question: string): Promise<void> {
    try {
      AIPanel._outputChannel.appendLine(`Received question: ${question}`);

      // Check if API key is available
      if (!this._apiKey) {
        throw new Error(
          "OpenAI API key is not configured. Please set it in your settings.",
        );
      }

      // Add user message to conversation history
      const userMessage: Message = {
        role: "user",
        content: question,
        timestamp: Date.now(),
      };
      this._messages.push(userMessage);

      // Call OpenAI API
      const response = await this._callOpenAI(this._messages);

      // Add AI response to conversation history
      if (response) {
        const aiMessage: AIMessage = {
          role: "assistant",
          content: response,
        };
        this._messages.push(aiMessage);

        // Send response back to webview
        this._panel.webview.postMessage({
          type: "response",
          content: response,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      AIPanel._outputChannel.appendLine(
        `Error handling question: ${errorMessage}`,
      );

      // Send error back to webview
      this._panel.webview.postMessage({
        type: "error",
        content: errorMessage,
      });
    }
  }

  private async _callOpenAI(
    messages: (Message | AIMessage)[],
  ): Promise<string> {
    try {
      AIPanel._outputChannel.appendLine("Calling OpenAI API...");

      // Format messages for OpenAI API
      const formattedMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Log the request for debugging
      AIPanel._outputChannel.appendLine(
        `Sending request to ${config.OPENAI_API_ENDPOINT}`,
      );
      AIPanel._outputChannel.appendLine(`Model: ${this._model}`);
      AIPanel._outputChannel.appendLine(
        `Messages count: ${formattedMessages.length}`,
      );

      // Make API request
      const response = await axios.post(
        config.OPENAI_API_ENDPOINT,
        {
          model: this._model,
          messages: formattedMessages,
          max_tokens: config.MAX_TOKENS,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this._apiKey}`,
          },
        },
      );

      const data = response.data as AIResponse;
      AIPanel._outputChannel.appendLine("Received response from OpenAI API");

      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      } else {
        throw new Error("No response from OpenAI API");
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        const responseData = error.response?.data;

        AIPanel._outputChannel.appendLine(
          `API error (${statusCode}): ${message}`,
        );
        AIPanel._outputChannel.appendLine(
          `Response data: ${JSON.stringify(responseData)}`,
        );
        throw new Error(`API error: ${message}`);
      } else {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        AIPanel._outputChannel.appendLine(
          `Error calling OpenAI API: ${errorMessage}`,
        );
        throw new Error(`Error calling OpenAI API: ${errorMessage}`);
      }
    }
  }
}

