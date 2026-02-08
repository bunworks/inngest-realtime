import { getEnvVar } from "../env";
import type { Realtime } from "../types";
import { TokenSubscription } from "./TokenSubscription";

export interface InngestApp {
  apiBaseUrl?: string;
  api?: {
    signingKey?: string;
    signingKeyFallback?: string;
    getSubscriptionToken?: (
      channelId: string,
      topics: string[],
    ) => Promise<string>;
  };
}

/**
 * Subscribe to a realtime channel
 */
export const subscribe = async <
  const InputChannel extends Realtime.Channel | string,
  const InputTopics extends (keyof Realtime.Channel.InferTopics<
    Realtime.Channel.AsChannel<InputChannel>
  > &
    string)[],
  const TToken extends Realtime.Subscribe.Token<
    Realtime.Channel.AsChannel<InputChannel>,
    InputTopics
  >,
  const TOutput extends Realtime.Subscribe.StreamSubscription<TToken>,
>(
  /**
   * Subscription token with settings
   */
  token: {
    /**
     * Inngest app instance
     */
    app?: InngestApp;

    /**
     * Channel ID or channel object
     */
    channel: Realtime.Subscribe.InferChannelInput<InputChannel>;

    /**
     * List of topics to subscribe to
     */
    topics: InputTopics;
  },

  /**
   * Callback to handle messages
   */
  callback?: Realtime.Subscribe.Callback<TToken>,
): Promise<TOutput> => {
  const app = token.app;
  const api = app?.api;

  // Allow users to specify public env vars for the target URLs, but do not
  // allow this for signing keys, as they should never be on a client.
  const maybeApiBaseUrl =
    app?.apiBaseUrl ||
    getEnvVar("INNGEST_BASE_URL") ||
    getEnvVar("INNGEST_API_BASE_URL");

  const maybeSigningKey = api?.signingKey || getEnvVar("INNGEST_SIGNING_KEY");

  const maybeSigningKeyFallback =
    api?.signingKeyFallback || getEnvVar("INNGEST_SIGNING_KEY_FALLBACK");

  const subscription = new TokenSubscription(
    token as Realtime.Subscribe.Token,
    maybeApiBaseUrl,
    maybeSigningKey,
    maybeSigningKeyFallback,
  );

  const retStream = subscription.getJsonStream();
  const callbackStream = subscription.getJsonStream();

  await subscription.connect();

  const extras = {
    getJsonStream: () => subscription.getJsonStream(),
    getEncodedStream: () => subscription.getEncodedStream(),
  };

  if (callback) {
    subscription.useCallback(callback, callbackStream);
  } else {
    callbackStream.cancel("Not needed");
  }

  return Object.assign(retStream, extras) as unknown as TOutput;
};

/**
 * Get subscription token
 */
export const getSubscriptionToken = async <
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
   * Inngest app instance
   */
  app: InngestApp,

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
  },
): Promise<TToken> => {
  const channelId =
    typeof args.channel === "string" ? args.channel : args.channel.name;

  if (!channelId) {
    throw new Error("Channel ID is required to create subscription token");
  }

  const key = await app.api?.getSubscriptionToken?.(channelId, args.topics);

  if (!key) {
    throw new Error("Failed to get subscription token");
  }

  const token = {
    channel: channelId,
    topics: args.topics,
    key,
  } as TToken;

  return token;
};
