import type { Realtime } from "./types";

export interface InngestMiddleware {
  name: string;
  init: (config: { client: any }) => {
    onFunctionRun: (config: { ctx: { runId: string } }) => {
      transformInput: (config: { ctx: { step: any } }) => {
        ctx: {
          publish: Realtime.PublishFn;
        };
      };
    };
  };
}

export const realtimeMiddleware = () => {
  return {
    name: "publish",
    init({ client }: { client: any }) {
      return {
        onFunctionRun({ ctx: { runId } }: { ctx: { runId: string } }) {
          return {
            transformInput({ ctx: { step } }: { ctx: { step: any } }) {
              const publish: Realtime.PublishFn = async (input) => {
                const { topic, channel, data } = await input;

                const publishOpts = {
                  topics: [topic],
                  channel,
                  runId,
                };

                const action = async () => {
                  const result = await client["api"].publish(publishOpts, data);

                  if (!result.ok) {
                    throw new Error(
                      `Failed to publish event: ${result.error?.error}`,
                    );
                  }
                };

                return step
                  .run(`publish:${publishOpts.channel}`, action)
                  .then(() => {
                    return data;
                  });
              };

              return {
                ctx: {
                  /**
                   * Function to publish messages to realtime channel
                   */
                  publish,
                },
              };
            },
          };
        },
      };
    },
  } as InngestMiddleware;
};

// Re-export types from here, as this is used as a separate entrypoint now
export * from "./types";
