export interface Message {
    role: 'user' | 'system';
    content: string;
    timestamp?: number;
    image?: {
        data: string;  // Base64 encoded image data
        type: string;  // MIME type of the image
        name?: string; // Optional filename
    };
}

export interface AIMessage {
    role: 'assistant';
    content: string;
}

export interface AIRequest {
    model: string;
    messages: Array<{role: string; content: string}>;
    max_tokens: number;
}

export interface AIResponse {
    choices: Array<{message: {role: string; content: string}}>;
    error?: {
        message: string;
        type: string;
        code?: string;
    };
}