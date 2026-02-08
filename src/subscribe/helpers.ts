import { getEnvVar } from "../env";
import type { Realtime } from "../types";
import { TokenSubscription } from "./TokenSubscription";

export interface BunworksApp {
  apiBaseUrl?: string;
  api?: {
    signingKey?: string;
    signingKeyFallback?: string;
    getSubscriptionToken?: (channelId: string, topics: string[]) => Promise<string>;
  };
}

/**
 * Подписка на realtime канал
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
   * Токен подписки с настройками
   */
  token: {
    /**
     * Экземпляр приложения Bunworks
     */
    app?: BunworksApp;

    /**
     * ID канала или объект канала
     */
    channel: Realtime.Subscribe.InferChannelInput<InputChannel>;

    /**
     * Список топиков для подписки
     */
    topics: InputTopics;
  },

  /**
   * Callback для обработки сообщений
   */
  callback?: Realtime.Subscribe.Callback<TToken>,
): Promise<TOutput> => {
  const app = token.app;
  const api = app?.api;

  // Allow users to specify public env vars for the target URLs, but do not
  // allow this for signing keys, as they should never be on a client.
  const maybeApiBaseUrl =
    app?.apiBaseUrl ||
    getEnvVar("BUNWORKS_BASE_URL") ||
    getEnvVar("BUNWORKS_API_BASE_URL");

  const maybeSigningKey =
    api?.signingKey || getEnvVar("BUNWORKS_SIGNING_KEY");

  const maybeSigningKeyFallback =
    api?.signingKeyFallback || getEnvVar("BUNWORKS_SIGNING_KEY_FALLBACK");

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
 * Получение токена подписки
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
   * Экземпляр приложения Bunworks
   */
  app: BunworksApp,

  /**
   * Параметры подписки
   */
  args: {
    /**
     * ID канала или объект канала
     */
    channel: Realtime.Subscribe.InferChannelInput<InputChannel>;

    /**
     * Список топиков
     */
    topics: InputTopics;
  },
): Promise<TToken> => {
  const channelId =
    typeof args.channel === "string" ? args.channel : args.channel.name;

  if (!channelId) {
    throw new Error("Требуется ID канала для создания токена подписки");
  }

  const key = await app.api?.getSubscriptionToken?.(
    channelId,
    args.topics,
  );

  if (!key) {
    throw new Error("Не удалось получить токен подписки");
  }

  const token = {
    channel: channelId,
    topics: args.topics,
    key,
  } as TToken;

  return token;
};
