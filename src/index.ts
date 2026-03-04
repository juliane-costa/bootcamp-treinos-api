// Import the framework and instantiate it
import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";
import { fromNodeHeaders } from "better-auth/node";
import { error } from "console";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import z from "zod";

import { Weekday } from "./generated/prisma/enums.js";
import { auth } from "./lib/auth.js";
import { CreateWorkoutPlan } from "./usecases/CreateWorkoutPlan.js";
import { NotFoundError } from "./errors/index.js";

const app = Fastify({
  logger: true,
});

// Add schema validator and serializer
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

//documentacao
await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Treinos API",
      description: "API para o Bootcamp Treinos",
      version: "1.0.0",
    },
    servers: [
      {
        description: "LocalHost",
        url: "http://localhost:3000",
      },
    ],
  },
  transform: jsonSchemaTransform,
});

await app.register(fastifyCors, {
  origin: ["http://localhost:3000"],
  credentials: true,
});

await app.register(fastifyApiReference, {
  routePrefix: "/docs",
  configuration: {
    sources: [
      {
        title: "Bootcamp Treinos API",
        slug: "bootcamp-treinos-api",
        url: "/swagger.json",
      },
      {
        title: "Auth API",
        slug: "auth-api",
        url: "/api/auth/open-api/generate-schema",
      },
    ],
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "POST",
  url: "/workout-plans",
  schema: {
    body: z.object({
      name: z.string().trim().min(1),
      workoutDays: z.array(
        z.object({
          name: z.string().trim().min(1),
          weekday: z.enum(Weekday),
          isRest: z.boolean().default(false),
          estimatedTimeInSeconds: z.number().min(1),
          exercises: z.array(
            z.object({
              order: z.number().min(0),
              name: z.string().trim().min(1),
              sets: z.number().min(1),
              reps: z.number().min(1),
              restTimeInSeconds: z.number().min(1),
            }),
          ),
        }),
      ),
    }),
    response: {
      201: z.object({
        id: z.uuid(),
        name: z.string().trim().min(1),
        workoutDays: z.array(
          z.object({
            name: z.string().trim().min(1),
            weekday: z.enum(Weekday),
            isRest: z.boolean().default(false),
            estimatedDurationInSeconds: z.number().min(1),
            exercises: z.array(
              z.object({
                order: z.number().min(0),
                name: z.string().trim().min(1),
                sets: z.number().min(1),
                reps: z.number().min(1),
                restTimeInSeconds: z.number().min(1),
              }),
            ),
          }),
        ),
      }),
      400: z.object({
        message: z.string(),
        code: z.string(),
      }),
      401: z.object({
        message: z.string(),
        code: z.string(),
      }),
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
      return reply.status(500).send({
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/swagger.json",
  handler: async () => {
    return app.swagger();
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    description: "Hello World",
    tags: ["ABC"],
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  },
  handler: () => {
    return { message: "Hello World" };
  },
});

// Register authentication endpoint
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      // Construct request URL
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Convert Fastify headers to standard Headers object
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });

      // Create Fetch API-compatible request
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      // Process authentication request
      const response = await auth.handler(req);

      // Forward response to client
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error: unknown) {
      app.log.error(error);
      if (error instanceof NotFoundError) {
        return reply.status(404).send({
          message: error.message,
          code: "NOT_FOUND",
        });
      }

      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

// Run the server!
try {
  const port = Number(process.env.PORT) || 3000;
  await app.listen({ host: "127.0.0.1", port });
  app.log.info(`Server listening at http://localhost:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
