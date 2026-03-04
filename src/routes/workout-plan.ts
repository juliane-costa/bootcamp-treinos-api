import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import { ErrorSchema, WorkoutPlanSchema } from "../schemas/index.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";

export const workoutPlanRoutes = async (app: FastifyInstance) => {
    app.withTypeProvider<ZodTypeProvider>().route({
        method: "POST",
        url: "/",
        schema: {
          body: WorkoutPlanSchema.omit({ id: true }),
          response: {
            201: WorkoutPlanSchema,
            400: ErrorSchema,
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
            const createWorkoutPlan = new CreateWorkoutPlan();
            const result = await createWorkoutPlan.execute({
              userId: session.user.id, //usuario que esta logado
              name: request.body.name,
              workoutDays: request.body.workoutDays,
            });
            return reply.status(201).send(result);
          } catch (error) {
            app.log.error(error);
            if (error instanceof NotFoundError) {
              return reply.status(404).send({
                message: error.message,
                code: "NOT_FOUND",
              });
            }
            return reply.status(500).send({
              message: "Internal server error",
              code: "INTERNAL_SERVER_ERROR",
            });
          }
        },
      });

}