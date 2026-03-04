import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  GetStatsQuerySchema,
  GetStatsResponseSchema,
} from "../schemas/index.js";
import { GetStats } from "../usecases/GetStats.js";

export const statsRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      tags: ["Stats"],
      summary: "Get workout statistics for the authenticated user",
      querystring: GetStatsQuerySchema,
      response: {
        200: GetStatsResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            message: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const getStats = new GetStats();
        const result = await getStats.execute({
          userId: session.user.id,
          from: request.query.from,
          to: request.query.to,
        });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);

        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            message: error.message,
            code: "NOT_FOUND_ERROR",
          });
        }

        return reply.status(500).send({
          message: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};
