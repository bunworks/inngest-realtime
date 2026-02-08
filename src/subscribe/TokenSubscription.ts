import debug from "debug";
import { api } from "../api";
import { getEnvVar } from "../env";
import { topic } from "../topic";
import { Realtime } from "../types";
import { createDeferredPromise, parseAsBoolean } from "../util";
import { StreamFanout } from "./StreamFanout";

/**
 * Realtime channel subscription via WebSocket
 */
export class TokenSubscription {
  #apiBaseUrl?: string;
  #channelId: string;
  #debug = debug("inngest:realtime");
  #encoder = new TextEncoder();
  #fanout = new StreamFanout<Realtime.Message>();
  #running = false;
  #topics: Map<string, Realtime.Topic.Definition>;
  #ws: WebSocket | null = null;
  #signingKey: string | undefined;
  #signingKeyFallback: string | undefined;
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 5;
  #reconnectDelay = 1000;
  #connectionPromise: Promise<void> | null = null;

  /**
   * Map of stream IDs to their streams and controllers
   */
  #chunkStreams = new Map<
    string,
    { stream: ReadableStream; controller: ReadableStreamDefaultController }
  >();

  constructor(
    /**
     * Subscription token
     */
    public token: Realtime.Subscribe.Token,
    apiBaseUrl: string | undefined,
    signingKey: string | undefined,
    signingKeyFallback: string | undefined,
  ) {
    this.#apiBaseUrl = apiBaseUrl;
    this.#signingKey = signingKey;
    this.#signingKeyFallback = signingKeyFallback;

    if (typeof token.channel === "string") {
      this.#channelId = token.channel;

      this.#topics = this.token.topics.reduce<
        Map<string, Realtime.Topic.Definition>
      >((acc, name) => {
        acc.set(name, topic(name));

        return acc;
      }, new Map<string, Realtime.Topic.Definition>());
    } else {
      this.#channelId = token.channel.name;

      this.#topics = this.token.topics.reduce<
        Map<string, Realtime.Topic.Definition>
      >((acc, name) => {
        acc.set(name, token.channel.topics[name] ?? topic(name));

        return acc;
      }, new Map<string, Realtime.Topic.Definition>());
    }
  }

  private async getWsUrl(token: string): Promise<URL> {
    let url: URL;
    const path = "/v1/realtime/connect";
    const devEnvVar = getEnvVar("INNGEST_DEV");

    if (this.#apiBaseUrl) {
      url = new URL(path, this.#apiBaseUrl);
    } else if (devEnvVar) {
      try {
        const devUrl = new URL(devEnvVar);
        url = new URL(path, devUrl);
      } catch {
        if (parseAsBoolean(devEnvVar)) {
          url = new URL(path, "http://localhost:8288/");
        } else {
          url = new URL(path, "https://api.inngest.com/");
        }
      }
    } else {
      url = new URL(
        path,
        getEnvVar("NODE_ENV") === "production"
          ? "https://api.inngest.com/"
          : "http://localhost:8288/",
      );
    }

    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("token", token);

    return url;
  }

  /**
   * Establish WebSocket connection
   */
  public async connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.#connectionPromise) {
      return this.#connectionPromise;
    }

    this.#connectionPromise = this.#connect();

    try {
      await this.#connectionPromise;
    } finally {
      this.#connectionPromise = null;
    }
  }

  async #connect() {
    this.#debug(
      `Establishing connection to channel "${
        this.#channelId
      }" with topics ${JSON.stringify([...this.#topics.keys()])}...`,
    );

    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is not supported in current environment");
    }

    let key = this.token.key;
    if (!key) {
      this.#debug(
        "No subscription token key passed; attempting to retrieve one automatically...",
      );

      key = (
        await this.lazilyGetSubscriptionToken({
          ...this.token,
          signingKey: this.#signingKey,
          signingKeyFallback: this.#signingKeyFallback,
        })
      ).key;

      if (!key) {
        throw new Error(
          "No subscription token key provided and failed to retrieve one automatically",
        );
      }
    }

    const ret = createDeferredPromise<void>();

    try {
      // Clean up existing connection if any
      if (this.#ws) {
        this.#cleanupWebSocket();
      }

      this.#ws = new WebSocket(await this.getWsUrl(key));

      this.#ws.onopen = () => {
        this.#debug("WebSocket connection established");
        this.#reconnectAttempts = 0;
        this.#running = true;
        ret.resolve();
      };

      this.#ws.onmessage = async (event) => {
        await this.#handleMessage(event);
      };

      this.#ws.onerror = (event) => {
        this.#debug("WebSocket error observed:", event);
        ret.reject(new Error("WebSocket connection error"));
      };

      this.#ws.onclose = (event) => {
        this.#debug("WebSocket closed:", event.code, event.reason);
        this.#handleClose(event);
      };
    } catch (err) {
      ret.reject(err);
    }

    return ret.promise;
  }

  #cleanupWebSocket() {
    if (!this.#ws) return;

    try {
      // Remove event listeners to prevent memory leaks
      this.#ws.onopen = null;
      this.#ws.onmessage = null;
      this.#ws.onerror = null;
      this.#ws.onclose = null;

      // Close connection if still open
      if (
        this.#ws.readyState === WebSocket.OPEN ||
        this.#ws.readyState === WebSocket.CONNECTING
      ) {
        this.#ws.close(1000, "Cleaning up connection");
      }
    } catch (err) {
      this.#debug("Error cleaning up WebSocket:", err);
    }

    this.#ws = null;
  }

  #handleClose(event: CloseEvent) {
    const wasRunning = this.#running;
    this.#running = false;

    // Close all chunk streams
    for (const [streamId, stream] of this.#chunkStreams.entries()) {
      try {
        stream.controller.close();
      } catch (err) {
        this.#debug(`Error closing stream ${streamId}:`, err);
      }
    }
    this.#chunkStreams.clear();

    // Normal closure or user-initiated close
    if (event.code === 1000 || !wasRunning) {
      this.#debug("Connection closed normally");
      this.#fanout.close();
      return;
    }

    // Attempt reconnection for abnormal closures
    if (this.#reconnectAttempts < this.#maxReconnectAttempts) {
      this.#reconnectAttempts++;
      const delay =
        this.#reconnectDelay * Math.pow(2, this.#reconnectAttempts - 1);

      this.#debug(
        `Attempting reconnection ${this.#reconnectAttempts}/${this.#maxReconnectAttempts} in ${delay}ms...`,
      );

      setTimeout(() => {
        this.connect().catch((err) => {
          this.#debug("Reconnection failed:", err);
          if (this.#reconnectAttempts >= this.#maxReconnectAttempts) {
            this.#debug("Max reconnection attempts reached, closing streams");
            this.#fanout.close();
          }
        });
      }, delay);
    } else {
      this.#debug("Max reconnection attempts reached");
      this.#fanout.close();
    }
  }

  async #handleMessage(event: MessageEvent) {
    const parseRes = await Realtime.messageSchema.safeParseAsync(
      JSON.parse(event.data as string),
    );

    if (!parseRes.success) {
      this.#debug("Received invalid message:", parseRes.error);
      return;
    }

    const msg = parseRes.data;

    if (!this.#running) {
      this.#debug(
        `Received message on channel "${msg.channel}" for topic "${msg.topic}" but stream is closed`,
      );
      return;
    }

    switch (msg.kind) {
      case "data": {
        await this.#handleDataMessage(msg);
        break;
      }

      case "datastream-start": {
        this.#handleDataStreamStart(msg);
        break;
      }

      case "datastream-end": {
        this.#handleDataStreamEnd(msg);
        break;
      }

      case "chunk": {
        this.#handleChunk(msg);
        break;
      }

      case "ping": {
        // Respond to ping with pong to keep connection alive
        if (this.#ws?.readyState === WebSocket.OPEN) {
          this.#ws.send(JSON.stringify({ kind: "pong" }));
        }
        break;
      }

      case "closing": {
        this.#debug("Server is closing connection, will reconnect...");
        break;
      }

      default: {
        this.#debug(
          `Received message on channel "${msg.channel}" with unhandled kind "${msg.kind}"`,
        );
      }
    }
  }

  async #handleDataMessage(msg: any) {
    if (!msg.channel) {
      this.#debug(`Received message with no channel`);
      return;
    }

    if (!msg.topic) {
      this.#debug(`Received message on channel "${msg.channel}" with no topic`);
      return;
    }

    const topic = this.#topics.get(msg.topic);
    if (!topic) {
      this.#debug(
        `Received message on channel "${msg.channel}" for unknown topic "${msg.topic}"`,
      );
      return;
    }

    const schema = topic.getSchema();
    if (schema) {
      const validateRes = await schema["~standard"].validate(msg.data);
      if (validateRes.issues) {
        console.error(
          `Received message on channel "${msg.channel}" for topic "${msg.topic}" that failed schema validation:`,
          validateRes.issues,
        );
        return;
      }

      msg.data = validateRes.value;
    }

    this.#debug(
      `Received message on channel "${msg.channel}" for topic "${msg.topic}":`,
      msg.data,
    );

    this.#fanout.write({
      channel: msg.channel,
      topic: msg.topic,
      data: msg.data,
      fnId: msg.fn_id,
      createdAt: msg.created_at || new Date(),
      runId: msg.run_id,
      kind: "data",
      envId: msg.env_id,
    });
  }

  #handleDataStreamStart(msg: any) {
    if (!msg.channel || !msg.topic) {
      this.#debug(`Received datastream-start with missing channel or topic`);
      return;
    }

    const streamId: unknown = msg.data;
    if (typeof streamId !== "string" || !streamId) {
      this.#debug(`Received datastream-start with invalid stream ID`);
      return;
    }

    if (this.#chunkStreams.has(streamId)) {
      this.#debug(
        `Received datastream-start for stream ID "${streamId}" that already exists`,
      );
      return;
    }

    const stream = new ReadableStream({
      start: (controller) => {
        this.#chunkStreams.set(streamId, { stream, controller });
      },

      cancel: () => {
        this.#chunkStreams.delete(streamId);
      },
    });

    this.#debug(`Created stream ID "${streamId}" on channel "${msg.channel}"`);

    this.#fanout.write({
      channel: msg.channel,
      topic: msg.topic,
      kind: "datastream-start",
      data: streamId,
      streamId,
      fnId: msg.fn_id,
      runId: msg.run_id,
      stream,
    });
  }

  #handleDataStreamEnd(msg: any) {
    if (!msg.channel || !msg.topic) {
      this.#debug(`Received datastream-end with missing channel or topic`);
      return;
    }

    const streamId: unknown = msg.data;
    if (typeof streamId !== "string" || !streamId) {
      this.#debug(`Received datastream-end with invalid stream ID`);
      return;
    }

    const stream = this.#chunkStreams.get(streamId);
    if (!stream) {
      this.#debug(
        `Received datastream-end for stream ID "${streamId}" that doesn't exist`,
      );
      return;
    }

    try {
      stream.controller.close();
    } catch (err) {
      this.#debug(`Error closing stream ${streamId}:`, err);
    }

    this.#chunkStreams.delete(streamId);

    this.#debug(`Closed stream ID "${streamId}" on channel "${msg.channel}"`);

    this.#fanout.write({
      channel: msg.channel,
      topic: msg.topic,
      kind: "datastream-end",
      data: streamId,
      streamId,
      fnId: msg.fn_id,
      runId: msg.run_id,
      stream: stream.stream,
    });
  }

  #handleChunk(msg: any) {
    if (!msg.channel || !msg.topic) {
      this.#debug(`Received chunk with missing channel or topic`);
      return;
    }

    if (!msg.stream_id) {
      this.#debug(`Received chunk with no stream ID`);
      return;
    }

    const stream = this.#chunkStreams.get(msg.stream_id);
    if (!stream) {
      this.#debug(`Received chunk for unknown stream ID "${msg.stream_id}"`);
      return;
    }

    this.#debug(
      `Received chunk on channel "${msg.channel}" for stream ID "${msg.stream_id}":`,
      msg.data,
    );

    try {
      stream.controller.enqueue(msg.data);
    } catch (err) {
      this.#debug(`Error enqueueing chunk to stream ${msg.stream_id}:`, err);
    }

    this.#fanout.write({
      channel: msg.channel,
      topic: msg.topic,
      kind: "chunk",
      data: msg.data,
      streamId: msg.stream_id,
      fnId: msg.fn_id,
      runId: msg.run_id,
      stream: stream.stream,
    });
  }

  /**
   * Lazily get a subscription token if not provided
   */
  private async lazilyGetSubscriptionToken<
    const InputChannel extends Realtime.Channel | string,
    const InputTopics extends (keyof Realtime.Channel.InferTopics<
      Realtime.Channel.AsChannel<InputChannel>
    > &
      string)[],
    const TToken extends Realtime.Subscribe.Token<
      Realtime.Channel.AsChannel<InputChannel>,
      InputTopics
    >,
  >(
    /**
     * Subscription parameters
     */
    args: {
      /**
       * Channel ID or channel object
       */
      channel: Realtime.Subscribe.InferChannelInput<InputChannel>;

      /**
       * List of topics
       */
      topics: InputTopics;

      /**
       * Signing key for authentication
       */
      signingKey: string | undefined;

      /**
       * Fallback signing key
       */
      signingKeyFallback: string | undefined;
    },
  ): Promise<TToken> {
    const channelId =
      typeof args.channel === "string" ? args.channel : args.channel.name;

    if (!channelId) {
      throw new Error("Channel ID is required to create a subscription token");
    }

    const key = await api.getSubscriptionToken({
      channel: channelId,
      topics: args.topics,
      signingKey: args.signingKey,
      signingKeyFallback: args.signingKeyFallback,
      apiBaseUrl: this.#apiBaseUrl,
    });

    const token = {
      channel: channelId,
      topics: args.topics,
      key,
    } as TToken;

    return token;
  }

  /**
   * Close the connection and cleanup resources
   */
  public close(
    /**
     * Reason for closing
     */
    reason = "Userland closed connection",
  ) {
    if (!this.#running && !this.#ws) {
      return;
    }

    this.#debug("close() called; closing connection...");
    this.#running = false;
    this.#reconnectAttempts = this.#maxReconnectAttempts; // Prevent reconnection

    // Close WebSocket connection
    this.#cleanupWebSocket();

    // Close all chunk streams
    for (const [streamId, stream] of this.#chunkStreams.entries()) {
      try {
        stream.controller.close();
      } catch (err) {
        this.#debug(`Error closing stream ${streamId}:`, err);
      }
    }
    this.#chunkStreams.clear();

    this.#debug(`Closing ${this.#fanout.size()} streams...`);
    this.#fanout.close();
  }

  /**
   * Get a new JSON stream from the subscription
   */
  public getJsonStream() {
    return this.#fanout.createStream();
  }

  /**
   * Get a new encoded stream (SSE-compatible) from the subscription
   */
  public getEncodedStream() {
    return this.#fanout.createStream((chunk) => {
      return this.#encoder.encode(`${JSON.stringify(chunk)}\n`);
    });
  }

  /**
   * Use a callback to handle messages from the stream
   */
  public useCallback(
    callback: Realtime.Subscribe.Callback,
    stream: ReadableStream<Realtime.Message> = this.getJsonStream(),
  ) {
    void (async () => {
      // Explicitly get and manage the reader so that we can manually release
      // the lock if anything goes wrong or we're done with it.
      const reader = stream.getReader();
      try {
        while (this.#running) {
          const { done, value } = await reader.read();
          if (done || !this.#running) break;

          try {
            callback(value);
          } catch (err) {
            this.#debug("Error in callback:", err);
          }
        }
      } catch (err) {
        this.#debug("Error reading from stream:", err);
      } finally {
        try {
          reader.releaseLock();
        } catch (err) {
          this.#debug("Error releasing reader lock:", err);
        }
      }
    })();
  }
}
