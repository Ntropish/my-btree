/**
 * Promise-based message passing bridge for worker communication
 */

export interface Message {
  id: string;
  [key: string]: any;
}

export interface ResponseMessage extends Message {
  error?: string;
  result?: any;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class MessageBridge {
  private pending = new Map<string, PendingRequest>();
  private defaultTimeout = 30000; // 30 seconds

  constructor(private worker: Worker) {
    this.setupMessageHandler();
  }

  /**
   * Setup message handler for receiving responses
   */
  private setupMessageHandler(): void {
    this.worker.addEventListener("message", (event) => {
      const message = event.data as ResponseMessage;

      if (!message.id) {
        console.warn("Received message without ID:", message);
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        console.warn("Received response for unknown request:", message.id);
        return;
      }

      // Clear timeout
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      // Resolve or reject based on response
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message);
      }
    });

    this.worker.addEventListener("error", (error) => {
      console.error("Worker error:", error);
      // Reject all pending requests
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Worker error: " + error.message));
      }
      this.pending.clear();
    });
  }

  /**
   * Send a message and wait for response
   */
  async send<TRequest extends Message, TResponse extends ResponseMessage>(
    message: Omit<TRequest, "id">,
    timeout?: number
  ): Promise<TResponse> {
    const id = nanoid();
    const fullMessage = { ...message, id } as TRequest;

    return new Promise<TResponse>((resolve, reject) => {
      // Set timeout
      const timeoutMs = timeout || this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store pending request
      this.pending.set(id, {
        resolve: (response) => resolve(response as TResponse),
        reject,
        timeout: timeoutHandle,
      });

      // Send message
      try {
        this.worker.postMessage(fullMessage);
      } catch (error) {
        // Clean up on send error
        clearTimeout(timeoutHandle);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Send a message without waiting for response
   */
  sendAsync<TRequest extends Message>(message: Omit<TRequest, "id">): void {
    const id = nanoid();
    const fullMessage = { ...message, id } as TRequest;
    this.worker.postMessage(fullMessage);
  }

  /**
   * Close the bridge and cleanup
   */
  close(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge closed"));
    }
    this.pending.clear();
  }
}

// Simple nanoid implementation for generating unique IDs
// (In production, you might want to use the actual nanoid package)
export function nanoid(size = 21): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(size));

  while (size--) {
    // Using & 63 is faster than % 64
    id += alphabet[bytes[size] & 63];
  }

  return id;
}
